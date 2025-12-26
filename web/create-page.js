const fs = require('fs');
const path = require('path');

const content = `"use client";

import { useState } from "react";
import { Sparkles, Send, Loader2, AlertCircle } from "lucide-react";

export default function DataMiningPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Data Mining</h1>
      <p className="text-muted-foreground">Ask questions about your data</p>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type your question..."
        className="w-full rounded border p-4"
      />
      <button disabled={loading} className="rounded bg-blue-500 px-4 py-2 text-white">
        {loading ? "Loading..." : "Ask"}
      </button>
    </div>
  );
}
`;

const targetPath = path.join(__dirname, 'src/app/data-mining/page.tsx');
fs.writeFileSync(targetPath, content, 'utf8');
console.log('Created:', targetPath);











