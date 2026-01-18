# Supabase Pagination Implementation Guide

## Problem

Fetching all rows (400+) from a Supabase table causes rendering lag. We need to implement pagination to fetch data in chunks as the user scrolls.

## Solution Overview

Implement **infinite scroll pagination** using Supabase's `range()` method to fetch data in pages of 50 rows at a time.

---

## Implementation

### 1. Create a Custom Hook: `usePaginatedQuery.ts`

```typescript
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient' // adjust path to your client

interface UsePaginatedQueryOptions {
  table: string
  select?: string
  orderBy?: string
  orderAscending?: boolean
  pageSize?: number
  filters?: Record<string, any> // optional filters like { branch_id: 123 }
}

interface UsePaginatedQueryReturn<T> {
  data: T[]
  loading: boolean
  error: Error | null
  hasMore: boolean
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

export function usePaginatedQuery<T = any>({
  table,
  select = '*',
  orderBy = 'created_at',
  orderAscending = false,
  pageSize = 50,
  filters = {}
}: UsePaginatedQueryOptions): UsePaginatedQueryReturn<T> {
  const [data, setData] = useState<T[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return

    setLoading(true)
    setError(null)

    try {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from(table)
        .select(select)
        .order(orderBy, { ascending: orderAscending })
        .range(from, to)

      // Apply any filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value)
        }
      })

      const { data: newRows, error: queryError } = await query

      if (queryError) throw queryError

      if (newRows) {
        setData(prev => page === 0 ? newRows : [...prev, ...newRows])
        setHasMore(newRows.length === pageSize)
        setPage(prev => prev + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, page, pageSize, table, select, orderBy, orderAscending, filters])

  const refresh = useCallback(async () => {
    setData([])
    setPage(0)
    setHasMore(true)
    // loadMore will be called after state resets
  }, [])

  return { data, loading, error, hasMore, loadMore, refresh }
}
```

---

### 2. Create an Infinite Scroll Table Component

```tsx
import { useEffect, useRef, useCallback } from 'react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'

interface DataTableProps {
  table: string
  columns: { key: string; header: string }[]
  filters?: Record<string, any>
}

export function PaginatedDataTable({ table, columns, filters }: DataTableProps) {
  const {
    data,
    loading,
    error,
    hasMore,
    loadMore
  } = usePaginatedQuery({
    table,
    pageSize: 50,
    filters
  })

  const observerTarget = useRef<HTMLDivElement>(null)

  // Load initial data
  useEffect(() => {
    loadMore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  if (error) {
    return <div className="text-red-500">Error: {error.message}</div>
  }

  return (
    <div className="overflow-auto max-h-[600px]">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-white">
          <tr>
            {columns.map(col => (
              <th key={col.key} className="border p-2 text-left">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, index) => (
            <tr key={row.id || index} className="hover:bg-gray-50">
              {columns.map(col => (
                <td key={col.key} className="border p-2">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Scroll sentinel - triggers loading when visible */}
      <div ref={observerTarget} className="h-10 flex items-center justify-center">
        {loading && <span className="text-gray-500">Loading more...</span>}
        {!hasMore && data.length > 0 && (
          <span className="text-gray-400">All data loaded</span>
        )}
      </div>
    </div>
  )
}
```

---

### 3. Usage Example

```tsx
// In your page or component
import { PaginatedDataTable } from '@/components/PaginatedDataTable'

export function MembersPage() {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'membership_type', header: 'Membership' },
    { key: 'created_at', header: 'Joined' }
  ]

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Members</h1>
      <PaginatedDataTable
        table="members"
        columns={columns}
        filters={{ branch_id: 123 }} // optional
      />
    </div>
  )
}
```

---

## Alternative: Cursor-Based Pagination

Use this if rows may be inserted/deleted while user is scrolling (avoids skipped/duplicate rows).

```typescript
// Instead of range(), use a cursor (last seen value)
const loadMoreCursor = async (lastCreatedAt: string | null) => {
  let query = supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (lastCreatedAt) {
    query = query.lt('created_at', lastCreatedAt)
  }

  const { data } = await query
  return data
}
```

---

## Key Supabase Methods

| Method | Description |
|--------|-------------|
| `.range(from, to)` | Fetch rows from index `from` to `to` (inclusive, 0-indexed) |
| `.limit(count)` | Limit results to `count` rows |
| `.order(column, { ascending })` | Sort results (required for consistent pagination) |
| `.lt(column, value)` | Filter where column < value (for cursor pagination) |
| `.gt(column, value)` | Filter where column > value |

---

## Performance Tips

1. **Always include `.order()`** - pagination without ordering leads to inconsistent results
2. **Use indexes** - ensure your `orderBy` column has a database index
3. **Keep page size reasonable** - 25-100 rows is typical; adjust based on row complexity
4. **Add loading skeletons** - improves perceived performance while data loads
5. **Consider virtualization** - for very long lists, use `react-window` or `@tanstack/react-virtual`

---

## File Structure

```
src/
├── hooks/
│   └── usePaginatedQuery.ts    # Reusable pagination hook
├── components/
│   └── PaginatedDataTable.tsx  # Table with infinite scroll
└── pages/
    └── MembersPage.tsx         # Usage example
```

---

## Dependencies

No additional dependencies required. Uses:
- React (useState, useEffect, useRef, useCallback)
- Supabase JS client (already in project)
- Intersection Observer API (native browser API)

Optional for enhanced UX:
- `react-window` or `@tanstack/react-virtual` for virtualized lists
- `react-loading-skeleton` for loading states
