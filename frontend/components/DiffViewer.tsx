"use client";

import React, { useState } from "react";
import { Check, Copy, FileCode, Plus, Minus } from "lucide-react";

interface DiffViewerProps {
  patch: string;
  targetFile?: string | null;
}

interface ParsedLine {
  type: "header" | "hunk" | "add" | "del" | "context" | "comment";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export default function DiffViewer({ patch, targetFile }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse lines into structured diff display
  const lines = patch.split("\n");
  const parsedLines: ParsedLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let addCount = 0;
  let delCount = 0;

  for (const rawLine of lines) {
    if (rawLine.startsWith("---") || rawLine.startsWith("+++")) {
      parsedLines.push({ type: "header", content: rawLine });
    } else if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      parsedLines.push({ type: "hunk", content: rawLine });
    } else if (rawLine.startsWith("+")) {
      addCount++;
      parsedLines.push({
        type: "add",
        content: rawLine.slice(1),
        newLineNumber: newLine++,
      });
    } else if (rawLine.startsWith("-")) {
      delCount++;
      parsedLines.push({
        type: "del",
        content: rawLine.slice(1),
        oldLineNumber: oldLine++,
      });
    } else if (rawLine.startsWith(" ")) {
      parsedLines.push({
        type: "context",
        content: rawLine.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    } else if (rawLine.trim()) {
      parsedLines.push({ type: "comment", content: rawLine });
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 font-mono text-xs shadow-2xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <FileCode className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-slate-200">
            {targetFile || "Unified Diff"}
          </span>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-950/80 px-2 py-0.5 text-emerald-400 font-medium border border-emerald-800/50">
              <Plus className="h-3 w-3" />
              {addCount}
            </span>
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-950/80 px-2 py-0.5 text-rose-400 font-medium border border-rose-800/50">
              <Minus className="h-3 w-3" />
              {delCount}
            </span>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 text-xs transition border border-slate-700"
          title="Copy Patch"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code diff lines */}
      <div className="overflow-x-auto max-h-[460px] p-2 leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {parsedLines.map((line, idx) => {
              if (line.type === "header") {
                return (
                  <tr key={idx} className="bg-slate-900/50 text-slate-500 select-none">
                    <td className="w-10 px-2 py-0.5 text-right opacity-40">---</td>
                    <td className="w-10 px-2 py-0.5 text-right opacity-40">+++</td>
                    <td className="px-3 py-0.5 font-semibold text-slate-400">{line.content}</td>
                  </tr>
                );
              }
              if (line.type === "hunk") {
                return (
                  <tr key={idx} className="bg-sky-950/30 text-sky-400 select-none border-y border-sky-900/40">
                    <td className="w-10 px-2 py-1 text-right text-sky-500/60 font-bold">...</td>
                    <td className="w-10 px-2 py-1 text-right text-sky-500/60 font-bold">...</td>
                    <td className="px-3 py-1 font-bold text-sky-300">{line.content}</td>
                  </tr>
                );
              }
              if (line.type === "add") {
                return (
                  <tr key={idx} className="bg-emerald-950/40 hover:bg-emerald-950/60 transition">
                    <td className="w-10 px-2 py-0.5 text-right text-slate-600 select-none"></td>
                    <td className="w-10 px-2 py-0.5 text-right text-emerald-500/80 font-semibold select-none border-r border-emerald-900/50">
                      {line.newLineNumber}
                    </td>
                    <td className="px-3 py-0.5 text-emerald-300 whitespace-pre">
                      <span className="select-none text-emerald-500 mr-2 font-bold">+</span>
                      {line.content}
                    </td>
                  </tr>
                );
              }
              if (line.type === "del") {
                return (
                  <tr key={idx} className="bg-rose-950/40 hover:bg-rose-950/60 transition">
                    <td className="w-10 px-2 py-0.5 text-right text-rose-500/80 font-semibold select-none">
                      {line.oldLineNumber}
                    </td>
                    <td className="w-10 px-2 py-0.5 text-right text-slate-600 select-none border-r border-rose-900/50"></td>
                    <td className="px-3 py-0.5 text-rose-300 whitespace-pre">
                      <span className="select-none text-rose-500 mr-2 font-bold">-</span>
                      {line.content}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx} className="hover:bg-slate-900/50 transition">
                  <td className="w-10 px-2 py-0.5 text-right text-slate-600 select-none">
                    {line.oldLineNumber}
                  </td>
                  <td className="w-10 px-2 py-0.5 text-right text-slate-600 select-none border-r border-slate-800">
                    {line.newLineNumber}
                  </td>
                  <td className="px-3 py-0.5 text-slate-300 whitespace-pre">
                    <span className="select-none text-slate-600 mr-2"> </span>
                    {line.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
