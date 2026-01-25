# Supabase Real-Time Implementation Guide

## Overview
This guide explains how to implement real-time data synchronization in Supabase applications, allowing changes made on mobile apps to instantly appear in web apps and vice versa.

## Prerequisites
- Supabase project configured
- Tables created in Supabase database
- Real-time replication enabled for target tables

## Enable Real-Time on Tables

### Via Supabase Dashboard
1. Navigate to Database → Replication
2. Find your table in the list
3. Toggle "Real-time" to enabled for each table you want to sync

### Via SQL
```sql
-- Enable real-time for a table
ALTER PUBLICATION supabase_realtime ADD TABLE your_table_name;

-- Disable real-time for a table (if needed)
ALTER PUBLICATION supabase_realtime DROP TABLE your_table_name;
```

## Basic Implementation

### React/Next.js Web App

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function YourComponent() {
  const [data, setData] = useState([])

  useEffect(() => {
    // Fetch initial data
    fetchInitialData()

    // Set up real-time subscription
    const channel = supabase
      .channel('custom-channel-name') // Unique channel name
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'your_table_name'
        },
        (payload) => {
          console.log('Real-time update received:', payload)
          handleRealtimeUpdate(payload)
        }
      )
      .subscribe()

    // Cleanup function - IMPORTANT to prevent memory leaks
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchInitialData = async () => {
    const { data, error } = await supabase
      .from('your_table_name')
      .select('*')
    
    if (data) setData(data)
  }

  const handleRealtimeUpdate = (payload) => {
    switch (payload.eventType) {
      case 'INSERT':
        setData(prev => [...prev, payload.new])
        break
      case 'UPDATE':
        setData(prev => prev.map(item => 
          item.id === payload.new.id ? payload.new : item
        ))
        break
      case 'DELETE':
        setData(prev => prev.filter(item => item.id !== payload.old.id))
        break
    }
  }

  return (
    <div>
      {/* Your UI using the real-time data */}
    </div>
  )
}
```

## Advanced Patterns

### Filter by Specific Criteria

```typescript
// Only listen to updates for specific records
const channel = supabase
  .channel('filtered-changes')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'branches',
      filter: 'association_id=eq.123' // Only this association
    },
    handleUpdate
  )
  .subscribe()
```

### Listen to Specific Events Only

```typescript
// INSERT only
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members' }, handleInsert)

// UPDATE only
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, handleUpdate)

// DELETE only
.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, handleDelete)
```

### Multiple Tables in One Channel

```typescript
const channel = supabase
  .channel('multi-table-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, handleMemberChange)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, handleClassChange)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, handleAttendanceChange)
  .subscribe()
```

### With TypeScript Types

```typescript
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type YourTable = {
  id: string
  name: string
  created_at: string
  // ... other fields
}

const handleRealtimeUpdate = (
  payload: RealtimePostgresChangesPayload<YourTable>
) => {
  if (payload.eventType === 'INSERT') {
    // payload.new is typed as YourTable
    const newRecord = payload.new
  } else if (payload.eventType === 'UPDATE') {
    // payload.new and payload.old are both available
    const updatedRecord = payload.new
    const oldRecord = payload.old
  } else if (payload.eventType === 'DELETE') {
    // Only payload.old is available
    const deletedRecord = payload.old
  }
}
```

## React Native / Mobile Implementation

```typescript
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function YourMobileComponent() {
  const [data, setData] = useState([])

  useEffect(() => {
    fetchData()

    // Same subscription pattern works on mobile
    const channel = supabase
      .channel('mobile-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'your_table' },
        handleUpdate
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleUpdate = (payload) => {
    // Update local state
    // Same logic as web app
  }

  // ... rest of component
}
```

## Custom Hooks for Reusability

```typescript
// hooks/useRealtimeTable.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useRealtimeTable<T>(tableName: string, initialQuery?: any) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch initial data
    const fetchData = async () => {
      let query = supabase.from(tableName).select('*')
      
      if (initialQuery) {
        query = initialQuery(query)
      }

      const { data: initialData, error } = await query
      if (initialData) setData(initialData as T[])
      setLoading(false)
    }

    fetchData()

    // Set up real-time subscription
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setData(prev => [...prev, payload.new as T])
          } else if (payload.eventType === 'UPDATE') {
            setData(prev => prev.map(item => 
              (item as any).id === (payload.new as any).id ? payload.new as T : item
            ))
          } else if (payload.eventType === 'DELETE') {
            setData(prev => prev.filter(item => 
              (item as any).id !== (payload.old as any).id
            ))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tableName])

  return { data, loading }
}

// Usage:
// const { data: members, loading } = useRealtimeTable('members')
```

## Performance Considerations

### 1. Use Filters to Reduce Payload
```typescript
// BAD - Receives all updates for entire table
.on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, handler)

// GOOD - Only receives relevant updates
.on('postgres_changes', { 
  event: '*', 
  schema: 'public', 
  table: 'members',
  filter: 'branch_id=eq.123'
}, handler)
```

### 2. Debounce Rapid Updates
```typescript
import { debounce } from 'lodash'

const debouncedUpdate = debounce((payload) => {
  handleRealtimeUpdate(payload)
}, 300)

.on('postgres_changes', config, debouncedUpdate)
```

### 3. Selective Re-rendering
```typescript
// Only update specific fields instead of entire record
const handleUpdate = (payload) => {
  if (payload.eventType === 'UPDATE') {
    setData(prev => prev.map(item => {
      if (item.id === payload.new.id) {
        // Only update changed fields
        return { ...item, ...payload.new }
      }
      return item
    }))
  }
}
```

## Troubleshooting

### Issue: Real-time not working
**Solution:**
1. Check that real-time is enabled for the table in Supabase dashboard
2. Verify RLS policies allow the user to SELECT from the table
3. Check browser console for subscription errors
4. Ensure `supabase.removeChannel()` is called in cleanup

### Issue: Memory leaks
**Solution:**
Always clean up subscriptions in useEffect return function:
```typescript
return () => {
  supabase.removeChannel(channel)
}
```

### Issue: Duplicate updates
**Solution:**
Use a unique channel name or ensure you're not setting up multiple subscriptions to the same table

### Issue: Updates not showing immediately
**Solution:**
Check your RLS policies - the user must have SELECT permission to receive real-time updates

## Row Level Security (RLS) Considerations

Real-time subscriptions respect RLS policies. The user must have SELECT permission on the table to receive updates.

```sql
-- Example: Users can only see their own organization's data
CREATE POLICY "Users can view own org data"
ON your_table
FOR SELECT
USING (organization_id = auth.jwt() ->> 'organization_id');
```

## Broadcasting Custom Events

For non-database events (like user presence), use broadcast:

```typescript
// Sender
const channel = supabase.channel('room-1')
channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    channel.send({
      type: 'broadcast',
      event: 'cursor-position',
      payload: { x: 100, y: 200 }
    })
  }
})

// Receiver
channel.on('broadcast', { event: 'cursor-position' }, (payload) => {
  console.log(payload)
})
```

## Presence (User Online Status)

Track which users are currently online:

```typescript
const channel = supabase.channel('online-users')

channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    console.log('Online users:', state)
  })
  .on('presence', { event: 'join' }, ({ newPresences }) => {
    console.log('User joined:', newPresences)
  })
  .on('presence', { event: 'leave' }, ({ leftPresences }) => {
    console.log('User left:', leftPresences)
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ 
        user_id: 'user-123',
        online_at: new Date().toISOString() 
      })
    }
  })
```

## Best Practices

1. **Always clean up subscriptions** - Use useEffect return function
2. **Use specific event types** - Don't listen to '*' if you only need INSERT
3. **Apply filters** - Reduce unnecessary network traffic
4. **Handle errors gracefully** - Implement error boundaries
5. **Use TypeScript** - Type your payloads for better DX
6. **Consider connection state** - Handle reconnection scenarios
7. **Batch updates** - Debounce rapid changes when appropriate
8. **Test with RLS** - Ensure policies work with real-time

## Example: YMCA Attendance Real-Time

```typescript
// Web dashboard showing live attendance updates
function AttendanceDashboard() {
  const [attendance, setAttendance] = useState([])

  useEffect(() => {
    // Fetch today's attendance
    const fetchAttendance = async () => {
      const { data } = await supabase
        .from('attendance')
        .select('*, members(*), classes(*)')
        .gte('check_in_time', new Date().toISOString().split('T')[0])
      
      if (data) setAttendance(data)
    }

    fetchAttendance()

    // Listen for new check-ins (from mobile app)
    const channel = supabase
      .channel('live-attendance')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance'
        },
        async (payload) => {
          // Fetch full record with relations
          const { data } = await supabase
            .from('attendance')
            .select('*, members(*), classes(*)')
            .eq('id', payload.new.id)
            .single()
          
          if (data) {
            setAttendance(prev => [data, ...prev])
            // Could also trigger a notification sound/toast
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div>
      <h2>Live Attendance ({attendance.length})</h2>
      {attendance.map(record => (
        <div key={record.id}>
          {record.members.name} checked in to {record.classes.name}
        </div>
      ))}
    </div>
  )
}
```

## References

- [Supabase Real-time Documentation](https://supabase.com/docs/guides/realtime)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Presence](https://supabase.com/docs/guides/realtime/presence)
