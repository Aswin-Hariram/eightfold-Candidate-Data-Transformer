import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  FileJson, FileText, FileSpreadsheet, NotebookPen, Play, Settings2,
  ShieldCheck, Sparkles, ChevronRight, ChevronDown, Database, Wand2, Hash, AlertCircle,
  Upload, X, FilePlus2, ZoomIn, ZoomOut, RotateCcw, Github, Linkedin, Link2,
  MapPin, Mail, Phone, Briefcase, GraduationCap, Globe, Plus, GitMerge, AlertTriangle,
  Maximize2, Eye, Copy, Check, Download, Braces, LayoutGrid, Columns2,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8002";
const API = `${BACKEND_URL}/api`;

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const iconForFile = (name) => {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".csv")) return <FileSpreadsheet size={16} className="text-emerald-600" />;
  if (n.endsWith(".json")) return <FileJson size={16} className="text-indigo-600" />;
  if (n.endsWith(".pdf")) return <FileText size={16} className="text-red-600" />;
  if (n.endsWith(".docx") || n.endsWith(".doc")) return <FileText size={16} className="text-sky-600" />;
  if (n.includes("notes")) return <NotebookPen size={16} className="text-amber-600" />;
  return <FileText size={16} className="text-rose-600" />;
};

const SOURCE_BADGE = {
  ats_json: { label: "ATS", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  recruiter_csv: { label: "CSV", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  resume: { label: "Resume", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  recruiter_notes: { label: "Notes", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  github: { label: "GitHub", cls: "bg-stone-900 text-white border-stone-900" },
  linkedin: { label: "LinkedIn", cls: "bg-blue-600 text-white border-blue-600" },
};

function flattenSources(input) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(input);
  return [...new Set(out)];
}

function ConfidenceBar({ value }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const pct = Math.round(v * 100);
  const color = v >= 0.8 ? "bg-emerald-500" : v >= 0.5 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div data-testid="confidence-bar" className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">Confidence</span>
        <span className="text-sm font-semibold text-stone-900">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProvenanceChips({ sources, size = "sm" }) {
  const unique = flattenSources(sources);
  if (unique.length === 0) return null;
  const sizeCls = size === "lg" ? "text-xs px-2.5 py-1" : "text-[11px] px-2 py-0.5";
  return (
    <div className="flex flex-wrap gap-1.5">
      {unique.map((s) => (
        <span key={s}
          className={`${sizeCls} rounded-md border font-medium ${SOURCE_BADGE[s]?.cls || "bg-stone-100 text-stone-600 border-stone-200"}`}>
          {SOURCE_BADGE[s]?.label || s}
        </span>
      ))}
    </div>
  );
}

function LinkChip({ link }) {
  const url = typeof link === "string" ? link : link.url;
  const type = (typeof link === "object" ? link.type : null) || "other";
  const icon = type === "github" ? <Github size={14}/> :
               type === "linkedin" ? <Linkedin size={14}/> :
               <Globe size={14}/>;
  const cls = type === "github" ? "bg-stone-900 text-white" :
              type === "linkedin" ? "bg-blue-600 text-white" :
              "bg-stone-100 text-stone-700 border border-stone-200";
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className={`inline-flex items-center gap-1.5 ${cls} px-2.5 py-1 rounded-md text-xs hover:opacity-80 transition-opacity`}>
      {icon} <span className="truncate max-w-[200px]">{url.replace(/^https?:\/\//, "")}</span>
    </a>
  );
}

function GithubMeta({ meta }) {
  if (!meta) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-stone-600">
      {meta.avatar_url && <img src={meta.avatar_url} alt="" className="w-7 h-7 rounded-full border border-stone-200" />}
      <div className="flex items-center gap-3">
        <span><span className="font-semibold text-stone-900">{meta.public_repos ?? 0}</span> repos</span>
        <span className="text-stone-300">·</span>
        <span><span className="font-semibold text-stone-900">{meta.followers ?? 0}</span> followers</span>
      </div>
    </div>
  );
}

function ConflictsPanel({ conflicts }) {
  if (!conflicts) return null;
  const keys = Object.keys(conflicts);
  if (keys.length === 0) return null;
  return (
    <div data-testid="conflicts-panel" className="px-6 py-3 border-b border-stone-100 bg-amber-50/40">
      <p className="text-[11px] uppercase tracking-wider text-amber-800 font-semibold mb-2.5 flex items-center gap-1.5">
        <AlertTriangle size={12}/> Resolved conflicts <span className="text-amber-600 font-bold">· {keys.length}</span>
      </p>
      <div className="space-y-2.5">
        {keys.map((k) => {
          const c = conflicts[k];
          const renderVal = (v) => {
            if (v == null) return "—";
            if (typeof v === "object") return JSON.stringify(v);
            return String(v);
          };
          return (
            <div key={k} className="text-xs bg-white border border-amber-100 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-stone-500 uppercase tracking-wider text-[10px]">{k}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                  ✓ <span className="font-mono">{renderVal(c.winner)}</span>
                  <span className="text-emerald-600">({(c.winning_sources || []).join(", ")})</span>
                </span>
                {(c.alternates || []).map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-stone-100 text-stone-600 border border-stone-200 px-2 py-0.5 rounded text-[11px] line-through decoration-stone-400">
                    <span className="font-mono">{renderVal(a.value)}</span>
                    <span className="text-stone-500 no-underline">({(a.sources || []).join(", ")})</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileCard({ profile, jsonZoom, onMaximize }) {
  const out = profile.output || {};
  const canonical = profile.canonical || {};
  const conf = out.overall_confidence ?? canonical.overall_confidence ?? 0;
  const allSources = flattenSources(canonical.provenance || out.provenance || {});
  const skills = out.skills || out.top_skills || canonical.skills || [];
  const links = out.links || canonical.links || [];
  const exp = out.experience || canonical.experience || [];
  const edu = out.education || canonical.education || [];
  const email = out.email || out.primary_email || (out.emails && out.emails[0]) || (canonical.emails && canonical.emails[0]);
  const phone = out.phone || out.primary_phone || (out.phones && out.phones[0]) || (canonical.phones && canonical.phones[0]);
  const location = out.location || canonical.location;
  const headline = out.headline || out.title || canonical.headline;
  const name = out.name || out.full_name || canonical.full_name || "—";
  const ghMeta = canonical._github;
  const conflicts = out.conflicts || canonical._conflicts;
  const conflictCount = conflicts ? Object.keys(conflicts).length : 0;

  return (
    <div data-testid={`profile-card-${profile.candidate_id}`}
      className="border border-stone-200 bg-white rounded-2xl overflow-hidden hover:border-stone-900 transition-colors">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-stone-100 bg-gradient-to-b from-stone-50/40 to-white">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-medium mb-1">
              {profile.candidate_id}
            </p>
            <h3 className="text-2xl font-serif text-stone-900 leading-tight truncate">{name}</h3>
            {headline && <p className="text-sm text-stone-700 mt-1 line-clamp-2">{headline}</p>}
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="w-36"><ConfidenceBar value={conf} /></div>
            {onMaximize && (
              <button
                data-testid={`maximize-btn-${profile.candidate_id}`}
                onClick={() => onMaximize(profile)}
                title="Maximize"
                className="text-stone-400 hover:text-stone-900 hover:bg-stone-100 p-1.5 rounded-md transition-colors">
                <Maximize2 size={15}/>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ProvenanceChips sources={allSources} />
          {conflictCount > 0 && (
            <span data-testid={`conflict-badge-${profile.candidate_id}`}
              className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
              <AlertTriangle size={11}/> {conflictCount} conflict{conflictCount > 1 ? "s" : ""} resolved
            </span>
          )}
        </div>
      </div>

      <ConflictsPanel conflicts={conflicts} />

      {/* Body: key facts */}
      <div className="px-6 py-4 space-y-2.5 border-b border-stone-100">
        {email && (
          <div className="flex items-center gap-2 text-sm text-stone-800">
            <Mail size={14} className="text-stone-400 shrink-0"/>
            <span className="font-mono truncate">{email}</span>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2 text-sm text-stone-800">
            <Phone size={14} className="text-stone-400 shrink-0"/>
            <span className="font-mono">{phone}</span>
          </div>
        )}
        {location && (location.city || location.country || location.raw) && (
          <div className="flex items-center gap-2 text-sm text-stone-800">
            <MapPin size={14} className="text-stone-400 shrink-0"/>
            <span>
              {[location.city, location.region, location.country].filter(Boolean).join(", ") || location.raw}
            </span>
          </div>
        )}
        {ghMeta && <GithubMeta meta={ghMeta} />}
      </div>

      {/* Links */}
      {links.length > 0 && (
        <div className="px-6 py-3 border-b border-stone-100">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-2">Links</p>
          <div className="flex flex-wrap gap-1.5">
            {links.map((l, i) => <LinkChip key={i} link={l} />)}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div className="px-6 py-3 border-b border-stone-100">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-2">
            Skills <span className="text-stone-400">· {skills.length}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="text-xs bg-stone-100 text-stone-800 border border-stone-200 px-2 py-0.5 rounded">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Experience */}
      {exp.length > 0 && (
        <div className="px-6 py-3 border-b border-stone-100">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5">
            <Briefcase size={11}/> Experience
          </p>
          <ul className="space-y-1.5">
            {exp.slice(0, 4).map((e, i) => (
              <li key={i} className="text-sm text-stone-800">
                <span className="font-medium">{e.title || "—"}</span>
                {e.company && <span className="text-stone-600"> · {e.company}</span>}
                {e.start_date && (
                  <span className="text-stone-500 text-xs ml-1">
                    ({e.start_date}{e.end_date ? ` → ${e.end_date}` : " → present"})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Education */}
      {edu.length > 0 && (
        <div className="px-6 py-3 border-b border-stone-100">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5">
            <GraduationCap size={11}/> Education
          </p>
          <ul className="space-y-1.5">
            {edu.map((e, i) => (
              <li key={i} className="text-sm text-stone-800">
                <span className="font-medium">{e.degree || "—"}</span>
                {e.institution && <span className="text-stone-600"> · {e.institution}</span>}
                {e.graduation_date && <span className="text-stone-500 text-xs ml-1">({e.graduation_date})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw JSON — primary deliverable, expanded by default */}
      <details className="group" open>
        <summary className="flex items-center gap-2 px-6 py-3 cursor-pointer select-none bg-[#171a23] text-stone-200 hover:bg-[#1d212c] transition-colors">
          <Braces size={13} className="text-emerald-400" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">Raw output</span>
          <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
            <button data-testid={`card-copy-${profile.candidate_id}`}
              onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(JSON.stringify(out, null, 2)); }}
              className="text-[11px] px-2 py-0.5 rounded border border-white/15 hover:bg-white/10 inline-flex items-center gap-1">
              <Copy size={11} /> Copy
            </button>
            <button data-testid={`card-download-${profile.candidate_id}`}
              onClick={(e) => { e.stopPropagation(); downloadJson(`${profile.candidate_id}.json`, out); }}
              className="text-[11px] px-2 py-0.5 rounded border border-white/15 hover:bg-white/10 inline-flex items-center gap-1">
              <Download size={11} /> Download
            </button>
          </div>
        </summary>
        <pre data-testid={`profile-json-${profile.candidate_id}`}
          style={{ fontSize: `${jsonZoom}px`, lineHeight: 1.55 }}
          className="leading-relaxed bg-[#0e1016] p-5 overflow-auto max-h-[28rem] text-stone-100 font-mono">
{JSON.stringify(out, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function RawBlock({ title, subtitle, obj, filename, zoom, testid, open, onToggle }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(obj, null, 2);
  const copy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };
  return (
    <div data-testid={testid} className="border-t border-white/10 first:border-t-0">
      <button onClick={onToggle} data-testid={`${testid}-toggle`}
        className="sticky top-0 z-10 w-full flex items-center gap-2 px-5 py-2.5 bg-[#1d212c] border-b border-white/10 text-left hover:bg-[#232838] transition-colors">
        {open ? <ChevronDown size={13} className="text-stone-400 shrink-0" /> : <ChevronRight size={13} className="text-stone-400 shrink-0" />}
        <span className="text-xs font-semibold text-stone-100 font-mono truncate">{title}</span>
        {subtitle && <span className="text-[11px] text-stone-400 truncate">· {subtitle}</span>}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span onClick={copy} data-testid={`${testid}-copy`}
            className="text-[11px] px-2 py-0.5 rounded border border-white/15 text-stone-200 hover:bg-white/10 transition-colors inline-flex items-center gap-1 cursor-pointer">
            {copied ? <><Check size={11} className="text-emerald-400" /> Copied</> : <><Copy size={11} /> Copy</>}
          </span>
          <span onClick={(e) => { e.stopPropagation(); downloadJson(filename, obj); }} data-testid={`${testid}-download`}
            className="text-[11px] px-2 py-0.5 rounded border border-white/15 text-stone-200 hover:bg-white/10 transition-colors inline-flex items-center gap-1 cursor-pointer">
            <Download size={11} /> Download
          </span>
        </div>
      </button>
      {open && (
        <pre style={{ fontSize: `${zoom}px`, lineHeight: 1.6 }}
          className="p-5 overflow-x-auto font-mono text-stone-100">
{text}
        </pre>
      )}
    </div>
  );
}

function RawOutputPanel({ data, zoom, tall }) {
  const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
  const ids = ["all", ...profiles.map((p) => p.candidate_id)];
  const [closed, setClosed] = useState({}); // id -> true means collapsed
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };
  const isOpen = (id) => !closed[id];
  const toggle = (id) => setClosed((c) => ({ ...c, [id]: !c[id] }));
  const setAll = (collapsed) => setClosed(collapsed ? Object.fromEntries(ids.map((i) => [i, true])) : {});
  const nameOf = (p) => p.output?.full_name || p.output?.name || p.canonical?.full_name || "";
  return (
    <div data-testid="raw-output-panel" className="border border-stone-800 bg-[#0e1016] rounded-2xl overflow-hidden flex flex-col shadow-sm">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-[#171a23]">
        <Braces size={15} className="text-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-200">Raw Output · JSON</span>
        <span className="text-[11px] text-stone-500">{profiles.length} profile{profiles.length === 1 ? "" : "s"}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button data-testid="raw-expand-all" onClick={() => setAll(false)}
            className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-stone-300 hover:bg-white/10 transition-colors">Expand all</button>
          <button data-testid="raw-collapse-all" onClick={() => setAll(true)}
            className="text-[11px] px-2 py-1 rounded-md border border-white/15 text-stone-300 hover:bg-white/10 transition-colors">Collapse all</button>
          <span className="w-px h-4 bg-white/15 mx-0.5" />
          <button data-testid="raw-copy-btn" onClick={copyAll}
            className="text-xs px-2.5 py-1 rounded-md border border-white/15 text-stone-200 hover:bg-white/10 transition-colors inline-flex items-center gap-1">
            {copied ? <><Check size={12} className="text-emerald-400" /> Copied</> : <><Copy size={12} /> Copy all</>}
          </button>
          <button data-testid="raw-download-btn" onClick={() => downloadJson("canonical_profiles.json", data)}
            className="text-xs px-2.5 py-1 rounded-md border border-white/15 text-stone-200 hover:bg-white/10 transition-colors inline-flex items-center gap-1">
            <Download size={12} /> Download all
          </button>
        </div>
      </div>
      <div className={`overflow-auto ${tall ? "max-h-[calc(100vh-230px)] min-h-[60vh]" : "max-h-[46vh]"}`}>
        <RawBlock testid="raw-block-all" title="ALL DATA — Complete Output"
          subtitle={`stats + ${profiles.length} profiles`} obj={data}
          filename="canonical_profiles.json" zoom={zoom}
          open={isOpen("all")} onToggle={() => toggle("all")} />
        {profiles.map((p) => (
          <RawBlock key={p.candidate_id} testid={`raw-block-${p.candidate_id}`}
            title={p.candidate_id} subtitle={nameOf(p)} obj={p}
            filename={`${p.candidate_id}.json`} zoom={zoom}
            open={isOpen(p.candidate_id)} onToggle={() => toggle(p.candidate_id)} />
        ))}
      </div>
    </div>
  );
}

function Modal({ open, onClose, children, size = "xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widthCls = size === "full" ? "w-[96vw] h-[92vh]" : "w-[88vw] max-w-6xl max-h-[88vh]";
  return (
    <div data-testid="modal-overlay"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()}
        className={`${widthCls} bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
        {children}
      </div>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* clipboard not available */ }
  };
  return (
    <button data-testid="copy-btn" onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md transition-colors">
      {copied ? <Check size={13}/> : <Copy size={13}/>}
      {copied ? "Copied" : label}
    </button>
  );
}

function MaximizedProfile({ profile, onClose, initialZoom = 14 }) {
  const [zoom, setZoom] = useState(initialZoom);
  const out = profile?.output || {};
  const jsonText = JSON.stringify(out, null, 2);
  return (
    <Modal open={!!profile} onClose={onClose} size="full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-medium">
            {profile?.candidate_id}
          </p>
          <h2 className="text-xl font-serif text-stone-900 truncate">
            {out.name || out.full_name || "—"}
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center bg-white border border-stone-200 rounded-lg overflow-hidden">
            <button data-testid="modal-zoom-out" onClick={() => setZoom((z) => Math.max(10, z - 1))}
              className="px-2 py-1.5 hover:bg-stone-100 text-stone-700"><ZoomOut size={14}/></button>
            <span className="text-xs text-stone-700 px-2 font-mono tabular-nums">{zoom}px</span>
            <button data-testid="modal-zoom-in" onClick={() => setZoom((z) => Math.min(22, z + 1))}
              className="px-2 py-1.5 hover:bg-stone-100 text-stone-700"><ZoomIn size={14}/></button>
            <button data-testid="modal-zoom-reset" onClick={() => setZoom(initialZoom)}
              className="px-2 py-1.5 hover:bg-stone-100 text-stone-700 border-l border-stone-200"><RotateCcw size={13}/></button>
          </div>
          <CopyButton text={jsonText} label="Copy JSON"/>
          <button data-testid="modal-close-btn" onClick={onClose}
            className="text-stone-500 hover:text-stone-900 hover:bg-stone-100 p-1.5 rounded-md transition-colors">
            <X size={18}/>
          </button>
        </div>
      </div>
      {/* Body: 2 columns */}
      <div className="flex-1 grid grid-cols-2 overflow-hidden">
        <div data-testid="modal-raw-pane" className="border-r border-stone-200 overflow-auto bg-stone-50/40 p-5">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Raw Output JSON</p>
          <pre data-testid={`modal-profile-json-${profile?.candidate_id}`}
            style={{ fontSize: `${zoom}px`, lineHeight: 1.6 }}
            className="bg-white border border-stone-200 rounded-xl p-4 text-stone-800 font-mono whitespace-pre">
{jsonText}
          </pre>
        </div>
        <div data-testid="modal-rendered-pane" className="overflow-auto p-5 bg-white">
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold mb-3">Structured View</p>
          {profile && <ProfileCard profile={profile} jsonZoom={zoom} />}
        </div>
      </div>
    </Modal>
  );
}

function FilePreviewModal({ file, content, loading, error, onClose }) {
  if (!file) return null;
  const name = file.name || file.path || "preview";
  const isPdf = !!file.pdfUrl;
  return (
    <Modal open={!!file} onClose={onClose}>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-stone-200 bg-stone-50">
        <Eye size={15} className="text-stone-600"/>
        <span className="text-sm font-mono text-stone-900 truncate flex-1">{name}</span>
        {file.extracted && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">extracted text</span>
        )}
        {file.size != null && <span className="text-xs text-stone-500">{file.size}b</span>}
        {isPdf && (
          <a data-testid="preview-open-pdf" href={file.pdfUrl} target="_blank" rel="noreferrer"
            className="text-xs px-2 py-1 rounded-md border border-stone-200 text-stone-700 hover:border-stone-400 inline-flex items-center gap-1">
            <Globe size={12}/> Open
          </a>
        )}
        {!isPdf && content && <CopyButton text={content} label="Copy"/>}
        <button data-testid="preview-close-btn" onClick={onClose}
          className="text-stone-500 hover:text-stone-900 hover:bg-stone-100 p-1.5 rounded-md transition-colors">
          <X size={17}/>
        </button>
      </div>
      <div data-testid="file-preview-body" className="flex-1 overflow-auto bg-stone-50/40 min-h-[300px]">
        {loading && <p className="text-sm text-stone-500 p-5">Loading…</p>}
        {error && <p className="text-sm text-rose-700 p-5">{error}</p>}
        {!loading && !error && isPdf && (
          <iframe data-testid="file-preview-pdf" title={name} src={file.pdfUrl}
            className="w-full h-[72vh] border-0 bg-white" />
        )}
        {!loading && !error && !isPdf && content != null && (
          <pre data-testid="file-preview-content"
            style={{ fontSize: "13px", lineHeight: 1.6 }}
            className="m-5 bg-white border border-stone-200 rounded-xl p-4 text-stone-800 font-mono whitespace-pre-wrap break-words">
{content}
          </pre>
        )}
      </div>
    </Modal>
  );
}

function ConfigEditor({ configs, configName, setConfigName, configText, setConfigText, error, warnings, onUploadConfig }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onUploadConfig(f);
  };

  return (
    <div className="border border-stone-200 bg-white rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100 bg-stone-50">
        <Settings2 size={15} className="text-stone-600" />
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Output Config</span>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          {configs.map((c) => (
            <button key={c.name} data-testid={`config-preset-${c.name}`}
              onClick={() => setConfigName(c.name)}
              className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors inline-flex items-center gap-1 ${
                configName === c.name
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-400"
              }`}>
              {c.custom && <Sparkles size={11} className={configName === c.name ? "text-amber-300" : "text-amber-500"} />}
              {c.name.replace(".json", "")}
            </button>
          ))}
          <button data-testid="config-upload-btn" onClick={() => fileRef.current?.click()}
            className="text-xs px-2.5 py-1 rounded-md border border-dashed border-stone-300 text-stone-600 font-medium hover:border-stone-500 hover:text-stone-900 transition-colors inline-flex items-center gap-1">
            <Upload size={12} /> Upload
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
            data-testid="config-upload-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadConfig(f); e.target.value = ""; }} />
        </div>
      </div>

      <div
        data-testid="config-dropzone"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        className={`relative ${drag ? "ring-2 ring-inset ring-stone-900/70" : ""}`}>
        {drag && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-900/5 backdrop-blur-[1px] pointer-events-none">
            <span className="text-xs font-semibold text-stone-700 inline-flex items-center gap-1.5">
              <FilePlus2 size={14} /> Drop a .json config to load it
            </span>
          </div>
        )}
        <textarea data-testid="config-editor-textarea"
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          spellCheck={false}
          style={{ fontSize: "13px", lineHeight: 1.6 }}
          className="w-full h-52 px-5 py-3 font-mono text-stone-800 bg-white focus:outline-none resize-none" />
      </div>

      {warnings && warnings.length > 0 && (
        <div data-testid="config-warnings" className="px-5 py-2 text-xs text-amber-800 border-t border-amber-100 bg-amber-50 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}</div>
          ))}
        </div>
      )}
      {error && (
        <div data-testid="config-error" className="px-5 py-2 text-xs text-rose-700 border-t border-rose-100 bg-rose-50 flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
        </div>
      )}
    </div>
  );
}

function FileUploader({ files, setFiles, onPreview }) {
  const inputRef = useRef(null);
  const onPick = (list) => {
    const arr = Array.from(list || []);
    setFiles((prev) => [...prev, ...arr]);
  };
  const onDrop = (e) => { e.preventDefault(); onPick(e.dataTransfer.files); };
  const removeAt = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div data-testid="file-uploader" className="border border-stone-200 bg-white rounded-2xl overflow-hidden">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="px-6 py-8 border-b border-stone-100 bg-stone-50/50 text-center cursor-pointer hover:bg-stone-100 transition-colors"
        onClick={() => inputRef.current?.click()}
        data-testid="file-drop-zone">
        <FilePlus2 className="mx-auto text-stone-500 mb-2" size={26} />
        <p className="text-sm text-stone-800 font-medium">Drop files or click to browse</p>
        <p className="text-xs text-stone-500 mt-1">
          .pdf · .docx · .csv · .json · .txt — any combination
        </p>
        <input ref={inputRef} type="file" multiple
          accept=".pdf,.docx,.doc,.csv,.json,.txt"
          onChange={(e) => onPick(e.target.files)}
          className="hidden" data-testid="file-input" />
      </div>
      {files.length > 0 && (
        <ul data-testid="uploaded-files-list" className="divide-y divide-stone-100 max-h-44 overflow-auto">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}
              data-testid={`uploaded-file-${i}`}
              onClick={() => onPreview && onPreview({ kind: "upload", file: f })}
              className="flex items-center gap-2.5 px-5 py-2.5 hover:bg-stone-50 cursor-pointer transition-colors">
              {iconForFile(f.name)}
              <span className="text-sm text-stone-800 font-mono truncate flex-1">{f.name}</span>
              <span className="text-xs text-stone-400">{Math.round(f.size / 1024)} kb</span>
              <button data-testid={`remove-file-${i}`}
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                className="text-stone-400 hover:text-rose-600 ml-1">
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UrlsInput({ urls, setUrls }) {
  const [draft, setDraft] = useState("");
  const addOne = () => {
    const u = draft.trim();
    if (!u) return;
    if (urls.includes(u)) { setDraft(""); return; }
    setUrls([...urls, u]);
    setDraft("");
  };
  const removeAt = (i) => setUrls(urls.filter((_, idx) => idx !== i));
  return (
    <div data-testid="urls-input" className="border border-stone-200 bg-white rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50 flex items-center gap-2">
        <Link2 size={14} className="text-stone-600"/>
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">GitHub / LinkedIn URLs</span>
      </div>
      <div className="px-5 py-3 flex items-center gap-2">
        <input data-testid="urls-input-field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOne())}
          placeholder="https://github.com/handle  or  https://linkedin.com/in/handle"
          className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-stone-900" />
        <button data-testid="urls-add-btn"
          onClick={addOne}
          className="flex items-center gap-1 px-3 py-2 bg-stone-900 hover:bg-stone-700 text-white text-sm rounded-lg">
          <Plus size={14}/> Add
        </button>
      </div>
      {urls.length > 0 && (
        <ul data-testid="urls-list" className="divide-y divide-stone-100 max-h-44 overflow-auto">
          {urls.map((u, i) => {
            const isGH = /github\.com/i.test(u);
            const isLI = /linkedin\.com/i.test(u);
            return (
              <li key={`${u}-${i}`} className="flex items-center gap-2.5 px-5 py-2.5">
                {isGH ? <Github size={14}/> : isLI ? <Linkedin size={14} className="text-blue-600"/> : <Globe size={14}/>}
                <span className="text-sm text-stone-800 font-mono truncate flex-1">{u}</span>
                <button data-testid={`remove-url-${i}`}
                  onClick={() => removeAt(i)}
                  className="text-stone-400 hover:text-rose-600">
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("sample"); // sample | upload
  const [sampleFiles, setSampleFiles] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [configName, setConfigName] = useState("default.json");
  const [configText, setConfigText] = useState("");
  const [configError, setConfigError] = useState(null);
  const [configWarnings, setConfigWarnings] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [uploads, setUploads] = useState([]);
  const [urls, setUrls] = useState([]);
  const [jsonZoom, setJsonZoom] = useState(13);
  const [viewMode, setViewMode] = useState("split"); // cards | split | json
  const [maxProfile, setMaxProfile] = useState(null);
  const [preview, setPreview] = useState(null); // { name, size?, content?, loading, error? }

  const handleConfigUpload = async (file) => {
    setConfigError(null);
    setConfigWarnings([]);
    let text;
    try { text = await file.text(); }
    catch (e) { setConfigError(`Could not read file: ${e.message}`); return; }
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { setConfigError(`Config JSON invalid: ${e.message}`); return; }

    const name = file.name.toLowerCase().endsWith(".json") ? file.name : `${file.name}.json`;
    setConfigs((prev) => [...prev.filter((c) => c.name !== name), { name, config: parsed, custom: true }]);
    setConfigText(JSON.stringify(parsed, null, 2));
    setConfigName(name);

    try {
      const { data } = await axios.post(`${API}/configs/validate`, { config: parsed });
      setConfigWarnings(data.warnings || []);
      if (!data.ok) setConfigError(data.errors.join("  •  "));
    } catch (_) { /* validation endpoint optional */ }
  };

  const openPreview = async (target) => {
    const f = target.file;
    const name = f.name;
    const ext = (name.toLowerCase().match(/\.(pdf|docx|doc)$/) || [])[1];

    if (target.kind === "sample") {
      if (ext === "pdf") {
        setPreview({ name, size: f.size, pdfUrl: `${API}/sample-data/${f.name}`, loading: false });
        return;
      }
      if (ext === "docx" || ext === "doc") {
        setPreview({ name, size: f.size, loading: true });
        try {
          const res = await fetch(`${API}/sample-data/extract/${f.name}`);
          const j = await res.json();
          setPreview({ name, size: f.size, content: j.text || "(empty)", extracted: true, loading: false });
        } catch (e) { setPreview({ name, size: f.size, error: e.message, loading: false }); }
        return;
      }
      setPreview({ name, size: f.size, loading: true });
      try {
        const res = await fetch(`${API}/sample-data/${f.name}`);
        setPreview({ name, size: f.size, content: await res.text(), loading: false });
      } catch (e) { setPreview({ name, size: f.size, error: e.message, loading: false }); }
      return;
    }

    if (target.kind === "upload") {
      if (ext === "pdf") {
        const objectUrl = URL.createObjectURL(f);
        setPreview({ name, size: f.size, pdfUrl: objectUrl, objectUrl, loading: false });
        return;
      }
      if (ext === "docx" || ext === "doc") {
        setPreview({ name, size: f.size, loading: true });
        try {
          const fd = new FormData();
          fd.append("file", f);
          const { data } = await axios.post(`${API}/preview`, fd, { headers: { "Content-Type": "multipart/form-data" } });
          setPreview({ name, size: f.size, content: data.text || "(empty)", extracted: true, loading: false });
        } catch (e) { setPreview({ name, size: f.size, error: e.response?.data?.error || e.message, loading: false }); }
        return;
      }
      setPreview({ name, size: f.size, loading: true });
      try {
        setPreview({ name, size: f.size, content: await f.text(), loading: false });
      } catch (e) { setPreview({ name, size: f.size, error: e.message, loading: false }); }
    }
  };

  const closePreview = () => {
    if (preview?.objectUrl) URL.revokeObjectURL(preview.objectUrl);
    setPreview(null);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [s, c] = await Promise.all([
          axios.get(`${API}/sample-data`),
          axios.get(`${API}/configs`),
        ]);
        setSampleFiles(s.data.files || []);
        setConfigs(c.data.configs || []);
        const def = (c.data.configs || []).find((x) => x.name === "default.json");
        if (def) setConfigText(JSON.stringify(def.config, null, 2));
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const sel = configs.find((c) => c.name === configName);
    if (sel) setConfigText(JSON.stringify(sel.config, null, 2));
  }, [configName, configs]);

  const runOnSample = async () => {
    setConfigError(null);
    let cfg;
    try { cfg = JSON.parse(configText); }
    catch (e) { setConfigError(`Config JSON invalid: ${e.message}`); return; }
    setRunning(true);
    try {
      const { data } = await axios.post(`${API}/transform/sample`, { config: cfg });
      setResult(data);
    } catch (e) {
      setConfigError(e.response?.data?.error || e.message);
    } finally { setRunning(false); }
  };

  const runOnUpload = async () => {
    setConfigError(null);
    if (uploads.length === 0 && urls.length === 0) {
      setConfigError("Add at least one file or URL to transform.");
      return;
    }
    let cfg;
    try { cfg = JSON.parse(configText); }
    catch (e) { setConfigError(`Config JSON invalid: ${e.message}`); return; }
    const fd = new FormData();
    uploads.forEach((f) => fd.append("files", f));
    fd.append("config", JSON.stringify(cfg));
    fd.append("urls", JSON.stringify(urls));
    setRunning(true);
    try {
      const { data } = await axios.post(`${API}/transform/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (e) {
      setConfigError(e.response?.data?.error || e.message);
    } finally { setRunning(false); }
  };

  const filtered = useMemo(() => {
    if (!result?.profiles) return [];
    const q = filterText.trim().toLowerCase();
    if (!q) return result.profiles;
    return result.profiles.filter((p) => {
      const hay = [
        p.candidate_id,
        JSON.stringify(p.output || {}),
        JSON.stringify(p.canonical || {}),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [result, filterText]);

  const enrichment = result?.stats?.enrichment;

  const emitted = useMemo(() => {
    if (!result) return null;
    return {
      generated_at: result.generated_at,
      stats: result.stats,
      profiles: filtered.map((p) => ({
        candidate_id: p.candidate_id,
        output: p.output,
        validation: p.validation,
      })),
    };
  }, [result, filtered]);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="max-w-[1500px] mx-auto px-8 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-stone-900 text-white flex items-center justify-center">
            <Wand2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-serif tracking-tight">Candidate Data Transformer</h1>
            <p className="text-[11px] text-stone-500 uppercase tracking-[0.2em] mt-0.5">
              Files · GitHub API · LinkedIn · Configurable · Deterministic
            </p>
          </div>
          <div className="ml-auto flex items-center gap-5 text-xs text-stone-500">
            <span className="flex items-center gap-1.5"><Database size={13}/> Node.js · Express</span>
            <span className="flex items-center gap-1.5"><Github size={13}/> GitHub auto-enrich</span>
            <span className="flex items-center gap-1.5"><ShieldCheck size={13}/> Provenance + Confidence</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-8 py-10 grid grid-cols-12 gap-8">
        {/* Left column */}
        <section className="col-span-12 lg:col-span-5 space-y-6">
          <div>
            <h2 className="text-3xl font-serif mb-2">Inputs</h2>
            <p className="text-sm text-stone-600 mb-5 leading-relaxed">
              Use the bundled sample data, or upload your own resumes (PDF/DOCX/TXT) and source
              files. Any <span className="font-medium text-stone-900">github.com</span> link found
              in your data triggers a live API enrichment.
            </p>

            <div className="inline-flex bg-stone-200 p-1 rounded-xl mb-5">
              <button data-testid="tab-sample"
                onClick={() => setTab("sample")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  tab === "sample" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"
                }`}>
                Bundled sample
              </button>
              <button data-testid="tab-upload"
                onClick={() => setTab("upload")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  tab === "upload" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"
                }`}>
                Upload + Social URLs
              </button>
            </div>

            {tab === "sample" && (
              <div data-testid="sample-files-list" className="border border-stone-200 bg-white rounded-2xl divide-y divide-stone-100 max-h-80 overflow-auto">
                {loading && <div className="p-5 text-sm text-stone-500">Loading sample data…</div>}
                {sampleFiles.map((f) => (
                  <button
                    key={f.name}
                    data-testid={`sample-file-${f.name}`}
                    onClick={() => openPreview({ kind: "sample", file: f })}
                    className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-stone-50 transition-colors text-left">
                    {iconForFile(f.name)}
                    <span className="text-sm text-stone-800 font-mono truncate">{f.name}</span>
                    <Eye size={13} className="ml-auto text-stone-300 group-hover:text-stone-500"/>
                    <span className="text-xs text-stone-400">{f.size}b</span>
                  </button>
                ))}
              </div>
            )}

            {tab === "upload" && (
              <div className="space-y-4">
                <FileUploader files={uploads} setFiles={setUploads} onPreview={openPreview} />
                <UrlsInput urls={urls} setUrls={setUrls} />
              </div>
            )}
          </div>

          <ConfigEditor
            configs={configs}
            configName={configName}
            setConfigName={setConfigName}
            configText={configText}
            setConfigText={setConfigText}
            error={configError}
            warnings={configWarnings}
            onUploadConfig={handleConfigUpload}
          />

          <button data-testid="run-pipeline-btn"
            onClick={tab === "sample" ? runOnSample : runOnUpload}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm">
            {tab === "upload" ? <Upload size={17}/> : <Play size={17}/>}
            {running ? "Transforming…" : tab === "sample" ? "Run on Sample Data" : "Run on Uploaded Files + URLs"}
            <ChevronRight size={17} />
          </button>
        </section>

        {/* Right column */}
        <section className="col-span-12 lg:col-span-7">
          <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
            <div>
              <h2 className="text-3xl font-serif">Canonical Profiles</h2>
              <p className="text-sm text-stone-600 mt-1">
                {result
                  ? (filterText.trim()
                      ? `${filtered.length} of ${result.profiles.length} profiles match “${filterText.trim()}”`
                      : `${result.stats.total_records} records → ${result.stats.total_candidates} candidates`)
                  : "Pick a config, then run the pipeline."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {result && (
                <>
                  <div data-testid="view-toggle" className="flex items-center bg-stone-200 p-0.5 rounded-lg">
                    {[["cards", LayoutGrid, "Cards"], ["split", Columns2, "Split"], ["json", Braces, "JSON"]].map(([m, Icon, label]) => (
                      <button key={m} data-testid={`view-${m}`} onClick={() => setViewMode(m)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors ${
                          viewMode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
                        }`}>
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                  <div data-testid="zoom-controls" className="flex items-center bg-white border border-stone-200 rounded-lg overflow-hidden">
                    <button data-testid="zoom-out-btn"
                      onClick={() => setJsonZoom((z) => Math.max(10, z - 1))}
                      title="Decrease JSON font"
                      className="px-2 py-1.5 hover:bg-stone-100 text-stone-700">
                      <ZoomOut size={14}/>
                    </button>
                    <span className="text-xs text-stone-700 px-2 font-mono tabular-nums">{jsonZoom}px</span>
                    <button data-testid="zoom-in-btn"
                      onClick={() => setJsonZoom((z) => Math.min(22, z + 1))}
                      title="Increase JSON font"
                      className="px-2 py-1.5 hover:bg-stone-100 text-stone-700">
                      <ZoomIn size={14}/>
                    </button>
                    <button data-testid="zoom-reset-btn"
                      onClick={() => setJsonZoom(13)}
                      title="Reset"
                      className="px-2 py-1.5 hover:bg-stone-100 text-stone-700 border-l border-stone-200">
                      <RotateCcw size={13}/>
                    </button>
                  </div>
                  <div className="relative">
                    <input data-testid="profile-filter-input"
                      value={filterText} onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Search name, skill, email, id…"
                      className="text-sm border border-stone-200 rounded-lg pl-3 pr-8 py-2 bg-white focus:outline-none focus:border-stone-900 w-60" />
                    {filterText && (
                      <button data-testid="filter-clear-btn" onClick={() => setFilterText("")}
                        title="Clear search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900 p-1 rounded">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {!result && (
            <div className="border border-dashed border-stone-300 rounded-2xl bg-white/50 p-16 text-center text-stone-500">
              <Sparkles className="mx-auto mb-4 text-stone-400" size={32} />
              <p className="text-base">
                {tab === "sample"
                  ? "Pick a config preset (or edit the JSON), then run the pipeline."
                  : "Drop PDF / DOCX / TXT / CSV / JSON files above, or paste GitHub / LinkedIn URLs."}
              </p>
              <p className="text-xs text-stone-400 mt-3 font-mono">
                CLI equivalent: node src/cli/index.js --inputs ./your-data --config configs/default.json
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-xs text-stone-700 bg-white border border-stone-200 rounded-xl px-5 py-3 flex-wrap">
                <span className="flex items-center gap-1.5"><Hash size={13}/> <span className="font-semibold text-stone-900">{result.stats.total_records}</span> records</span>
                <span className="flex items-center gap-1.5"><Database size={13}/> <span className="font-semibold text-stone-900">{result.stats.files.length}</span> files</span>
                <span className="flex items-center gap-1.5"><ShieldCheck size={13}/> <span className="font-semibold text-stone-900">{result.stats.orphan_records}</span> orphans</span>
                {enrichment && (enrichment.github > 0 || enrichment.linkedin > 0) && (
                  <>
                    <span className="text-stone-300">·</span>
                    {enrichment.github > 0 && (
                      <span className="flex items-center gap-1.5 text-stone-900">
                        <Github size={13}/> <span className="font-semibold">+{enrichment.github}</span> GitHub
                      </span>
                    )}
                    {enrichment.linkedin > 0 && (
                      <span className="flex items-center gap-1.5 text-blue-700">
                        <Linkedin size={13}/> <span className="font-semibold">+{enrichment.linkedin}</span> LinkedIn
                      </span>
                    )}
                  </>
                )}
                <span className="ml-auto text-stone-400 font-mono text-[11px]">{result.generated_at}</span>
              </div>

              {result.stats.resolution && result.stats.resolution.merges?.length > 0 && (
                <div data-testid="resolution-banner" className="bg-stone-900 text-stone-100 rounded-xl px-5 py-3 flex items-center gap-3 text-sm">
                  <GitMerge size={16} className="text-emerald-400" />
                  <span>
                    <span className="font-semibold">{result.stats.resolution.merges.length}</span> duplicate
                    candidate{result.stats.resolution.merges.length > 1 ? "s" : ""} fuzzy-merged
                    ({result.stats.resolution.groups_before} → {result.stats.resolution.groups_after} groups)
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-stone-400 truncate">
                    {result.stats.resolution.merges.slice(0, 2).map((m) => `${m.from} → ${m.into}`).join("  ·  ")}
                    {result.stats.resolution.merges.length > 2 ? ` · +${result.stats.resolution.merges.length - 2} more` : ""}
                  </span>
                </div>
              )}

              {filterText.trim() && filtered.length === 0 ? (
                <div data-testid="no-results" className="border border-dashed border-stone-300 rounded-2xl bg-white/50 p-16 text-center text-stone-500">
                  <AlertCircle className="mx-auto mb-3 text-stone-400" size={26} />
                  <p className="text-base">No profiles match “{filterText.trim()}”.</p>
                  <button data-testid="no-results-clear" onClick={() => setFilterText("")}
                    className="mt-3 text-sm text-stone-700 underline hover:text-stone-900">Clear search</button>
                </div>
              ) : (
                <>
                  {viewMode === "json" && (
                    <RawOutputPanel data={emitted} zoom={jsonZoom} tall />
                  )}

                  {viewMode === "split" && (
                    <RawOutputPanel data={emitted} zoom={jsonZoom} />
                  )}

                  {viewMode !== "json" && (
                    <div data-testid="profiles-grid" className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
                      {filtered.map((p) => (
                        <ProfileCard key={p.candidate_id} profile={p} jsonZoom={jsonZoom} onMaximize={setMaxProfile} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-[1500px] mx-auto px-8 py-6 text-xs text-stone-500 flex items-center justify-between flex-wrap gap-2">
          <span>Eightfold candidate-transformer · Node.js implementation</span>
          <span className="font-mono">v1.7 · raw-folding · search · file-preview · one-pager-docs</span>
        </div>
      </footer>

      <MaximizedProfile profile={maxProfile} onClose={() => setMaxProfile(null)} initialZoom={jsonZoom} />
      <FilePreviewModal
        file={preview}
        content={preview?.content}
        loading={preview?.loading}
        error={preview?.error}
        onClose={closePreview}
      />
    </div>
  );
}
