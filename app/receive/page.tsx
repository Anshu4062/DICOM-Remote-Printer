"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  email: string;
}

export default function Receive() {
  const [user, setUser] = useState<User | null>(null);
  const [addresses, setAddresses] = useState<
    Array<{ name: string; address: string }>
  >([]);
  const [status, setStatus] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [knownFiles, setKnownFiles] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [callingAET, setCallingAET] = useState("RECEIVER");
  const [port, setPort] = useState("11112");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    if (!token || !userData) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(userData));
  }, [router]);

  useEffect(() => {
    fetch("/api/network/info")
      .then((r) => r.json())
      .then((d) => setAddresses(d.addresses || []));
  }, []);

  const refreshStatus = async () => {
    if (!user) return;
    const res = await fetch("/api/dicom/scp/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    const s = await res.json();
    setStatus(s);

    // Auto-log newly received files to history with basic metadata
    if (s?.files?.length) {
      const newOnes = (s.files as string[]).filter(
        (f: string) => !knownFiles.has(f)
      );
      if (newOnes.length) {
        const updated = new Set(knownFiles);
        for (const f of newOnes) {
          // Skip metadata cache entries
          if (f.includes("/_meta/") || f.endsWith(".json")) continue;
          updated.add(f);
          try {
            // fetch minimal metadata to capture patient name
            const mdRes = await fetch("/api/dicom/metadata", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: user.id,
                filename: f,
                scope: "received",
              }),
            });
            const md = await mdRes.json();
            await fetch("/api/history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: user.id,
                filename: f,
                action: "received",
                metadata: md?.metadata || {},
              }),
            });
          } catch {}
        }
        setKnownFiles(updated);
        // refresh history after logging
        await loadHistory();
      }
    }
  };

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const start = async () => {
    if (!user) return;
    const res = await fetch("/api/dicom/scp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        aeTitle: callingAET,
        port: Number(port) || 11112,
      }),
    });
    const data = await res.json();
    // attach command/logs (best-effort) for UI visibility
    setStatus((prev: any) => ({ ...(prev || {}), startInfo: data }));
    await refreshStatus();
  };
  const stop = async () => {
    if (!user) return;
    await fetch("/api/dicom/scp/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    await refreshStatus();
  };

  const viewMetadata = async (fname: string) => {
    if (!user) return;
    setSelectedFile(fname);
    const res = await fetch("/api/dicom/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        filename: fname,
        scope: "received",
      }),
    });
    const data = await res.json();
    if (res.ok) setMetadata(data.metadata);
  };

  const saveHistory = async (fname: string) => {
    if (!user) return;
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        filename: fname,
        action: "received",
        metadata: metadata || {},
      }),
    });
  };

  const loadHistory = async () => {
    if (!user) return;
    const res = await fetch(
      `/api/history?userId=${encodeURIComponent(user.id)}`
    );
    const d = await res.json();
    if (res.ok) setHistory(d.history || []);
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Group received history by Study Instance UID and compute merged metadata + counts
  const receivedGroups = useMemo(() => {
    const received = (history || [])
      .filter((h) => h.action === "received")
      .filter((h) => h?.filename && !h.filename.endsWith(".json"));
    const byKey = new Map<string, any[]>();
    for (const h of received) {
      const m = h?.metadata || {};
      const stablePatient = m.patientId || m.patientName || "";
      const altStudy = m.accessionNumber || m.studyId || "";
      const altDate = m.studyDate || "";
      const key =
        m.studyInstanceUID && String(m.studyInstanceUID).trim() !== ""
          ? String(m.studyInstanceUID)
          : altStudy
          ? `${stablePatient}::${altStudy}`
          : stablePatient || altDate
          ? `${stablePatient}::${altDate}`
          : `file:${h.filename}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(h);
    }

    const pickFirstNonEmpty = (items: any[], path: string[]) => {
      for (const it of items) {
        let cur: any = it?.metadata || {};
        for (const p of path) cur = cur?.[p];
        if (cur !== undefined && cur !== null && String(cur).trim() !== "") {
          return cur;
        }
      }
      return undefined;
    };

    const groups: Array<{
      key: string;
      count: number;
      items: any[];
      firstCreatedAt: string;
      lastCreatedAt: string;
      merged: any;
      firstFilename: string;
    }> = [];

    byKey.forEach((items, key) => {
      const sorted = [...items].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const merged = {
        patientName:
          pickFirstNonEmpty(sorted, ["patientName"]) ||
          first?.metadata?.patientName,
        patientId:
          pickFirstNonEmpty(sorted, ["patientId"]) ||
          first?.metadata?.patientId,
        patientSex:
          pickFirstNonEmpty(sorted, ["patientSex"]) ||
          first?.metadata?.patientSex,
        patientBirthDate:
          pickFirstNonEmpty(sorted, ["patientBirthDate"]) ||
          first?.metadata?.patientBirthDate,
        modality:
          pickFirstNonEmpty(sorted, ["modality"]) || first?.metadata?.modality,
        studyDescription:
          pickFirstNonEmpty(sorted, ["studyDescription"]) ||
          first?.metadata?.studyDescription,
        institutionName:
          pickFirstNonEmpty(sorted, ["institutionName"]) ||
          first?.metadata?.institutionName,
        stationName:
          pickFirstNonEmpty(sorted, ["stationName"]) ||
          first?.metadata?.stationName,
        studyInstanceUID:
          pickFirstNonEmpty(sorted, ["studyInstanceUID"]) ||
          first?.metadata?.studyInstanceUID,
        seriesInstanceUID:
          pickFirstNonEmpty(sorted, ["seriesInstanceUID"]) ||
          first?.metadata?.seriesInstanceUID,
        studyId:
          pickFirstNonEmpty(sorted, ["studyId"]) || first?.metadata?.studyId,
        accessionNumber:
          pickFirstNonEmpty(sorted, ["accessionNumber"]) ||
          first?.metadata?.accessionNumber,
        referringPhysicianName:
          pickFirstNonEmpty(sorted, ["referringPhysicianName"]) ||
          first?.metadata?.referringPhysicianName,
      };
      // Count individual images (each item represents one DICOM file)
      // For received files, each history entry is typically one DICOM image
      const totalImages = items.reduce((total, item) => {
        // If the item has fileCount metadata (from zip files), use that
        // Otherwise, each item counts as 1 image
        return total + (item.metadata?.fileCount || 1);
      }, 0);

      groups.push({
        key,
        count: totalImages, // Total individual images in this study
        items,
        firstCreatedAt: first?.createdAt,
        lastCreatedAt: last?.createdAt,
        merged,
        firstFilename: first?.filename,
      });
    });
    // newest first by last activity
    groups.sort(
      (a, b) =>
        new Date(b.lastCreatedAt).getTime() -
        new Date(a.lastCreatedAt).getTime()
    );
    return groups;
  }, [history]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Receive DICOM (C-STORE SCP)
            </h1>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 text-sm rounded-md bg-gray-800 text-white hover:bg-black"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="bg-white shadow rounded-lg p-6 lg:col-span-2">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Listener</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  AE Title
                </label>
                <input
                  value={callingAET}
                  onChange={(e) => setCallingAET(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Port
                </label>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="flex items-end gap-3">
                <button
                  onClick={start}
                  className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
                >
                  Start
                </button>
                <button
                  onClick={stop}
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                >
                  Stop
                </button>
                <button
                  onClick={refreshStatus}
                  className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-800"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="text-sm text-gray-700 space-y-2">
              <div>
                <span className="font-medium">Status:</span>{" "}
                {status?.running ? "Running" : "Stopped"}{" "}
                {status?.running && `(PID ${status?.pid})`}
              </div>
              <div>
                <span className="font-medium">Out dir:</span>{" "}
                {status?.outDir || "-"}
              </div>
              <div>
                <span className="font-medium">Use these from sender:</span> AE{" "}
                <span className="font-semibold">
                  {status?.ae || callingAET}
                </span>
                , Port{" "}
                <span className="font-semibold">
                  {status?.port || Number(port) || 11112}
                </span>
              </div>
              <div>
                <span className="font-medium">Your IPs:</span>{" "}
                {addresses.length
                  ? addresses.map((a) => a.address).join(", ")
                  : "-"}
              </div>
              {(status?.startInfo?.command || status?.command) && (
                <div className="mt-3 rounded-md bg-gray-100 p-3 text-xs text-gray-800">
                  <div className="font-semibold mb-1">Last start command</div>
                  <pre className="whitespace-pre-wrap break-all">
                    {status?.command || status?.startInfo?.command}
                  </pre>
                  {(status?.logs || status?.startInfo?.logs) && (
                    <>
                      <div className="font-semibold mt-2">storescp logs</div>
                      <pre className="whitespace-pre-wrap break-all max-h-40 overflow-auto">
                        {status?.logs || status?.startInfo?.logs}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* removed explicit Received Files list */}

          {/* Metadata panel */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Metadata</h2>
            {!metadata ? (
              <div className="text-sm text-gray-500">
                Select a file to view metadata.
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                Use the history table to open metadata popup.
              </div>
            )}
          </div>
        </div>

        {/* History at bottom - grouped by Study UID with detailed 3-row layout */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">
              Received History
            </h2>
            <div className="flex items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, ID, accession, UID…"
                className="w-72 rounded-md border border-gray-900 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={async () => {
                  if (!user) return;
                  await fetch(
                    `/api/dicom/scp/status?userId=${encodeURIComponent(
                      user.id
                    )}`,
                    {
                      method: "DELETE",
                    }
                  );
                  // Also clear history entries and uploads/receives files for this user
                  await fetch(
                    `/api/history?userId=${encodeURIComponent(
                      user.id
                    )}&all=true&keepReceives=true`,
                    { method: "DELETE" }
                  );
                  setKnownFiles(new Set());
                  await loadHistory();
                  await refreshStatus();
                }}
                className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
                title="Delete all received files"
              >
                Clear All
              </button>
            </div>
          </div>
          {!receivedGroups.length ? (
            <div className="text-sm text-gray-500">No entries yet.</div>
          ) : (
            <div className="overflow-auto">
              <div className="min-w-[1000px]">
                <div className="grid grid-cols-12 text-sm text-gray-700 border-b pb-3">
                  <div className="col-span-2 font-medium">Action</div>
                  <div className="col-span-3 font-medium">Patient / Study</div>
                  <div className="col-span-3 font-medium">Site / Station</div>
                  <div className="col-span-3 font-medium">UIDs</div>
                  <div className="col-span-1 text-right font-medium">
                    Images
                  </div>
                </div>
                {receivedGroups
                  .filter((g) => {
                    const t = (search || "").toLowerCase();
                    if (!t) return true;
                    const m = g.merged || {};
                    const hay = [
                      g.firstFilename,
                      m.patientName,
                      m.patientId,
                      m.accessionNumber,
                      m.studyId,
                      m.studyInstanceUID,
                      m.seriesInstanceUID,
                      m.institutionName,
                      m.stationName,
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase();
                    return hay.includes(t);
                  })
                  .map((g) => (
                    <div key={g.key} className="py-4 border-b">
                      {/* Row 1 */}
                      <div className="grid grid-cols-12 items-start gap-3">
                        <div className="col-span-2">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                            Received
                          </span>
                          <div className="mt-2 text-xs text-gray-600 break-all">
                            {g.firstFilename}
                          </div>
                          <div className="mt-1 text-xs text-gray-600">
                            {new Date(g.lastCreatedAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <div className="text-base font-semibold text-gray-900 truncate">
                            {g.merged.patientName || "-"}
                            {g.merged.patientId ? (
                              <span className="text-gray-500 font-normal">
                                {" "}
                                • ID: {g.merged.patientId}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-sm text-gray-700">
                            {g.merged.modality || "-"}
                            {g.merged.studyDescription ? (
                              <span className="text-gray-500">
                                {" "}
                                • {g.merged.studyDescription}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <div className="text-sm text-gray-700">
                            {g.merged.institutionName || "-"}
                            {g.merged.stationName ? (
                              <span className="text-gray-500">
                                {" "}
                                • {g.merged.stationName}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-sm text-gray-700">
                            Accession: {g.merged.accessionNumber || "-"}
                            {g.merged.studyId ? (
                              <span className="text-gray-500">
                                {" "}
                                • Study ID: {g.merged.studyId}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <div className="text-[12px] font-mono bg-blue-50 rounded border border-blue-200 text-blue-800 px-3 py-1.5 break-all">
                            <span className="font-semibold">Study UID:</span>{" "}
                            {g.merged.studyInstanceUID || "-"}
                          </div>
                          <div className="mt-1 text-[12px] font-mono bg-blue-50 rounded border border-blue-200 text-blue-800 px-3 py-1.5 break-all">
                            <span className="font-semibold">Series UID:</span>{" "}
                            {g.merged.seriesInstanceUID || "-"}
                          </div>
                        </div>
                        <div className="col-span-1 text-right font-bold text-gray-900">
                          {g.count}
                        </div>
                      </div>
                      {/* Row 2 */}
                      <div className="grid grid-cols-12 mt-3 text-sm text-gray-800">
                        <div className="col-span-4">
                          Sex: {g.merged.patientSex || "-"}
                        </div>
                        <div className="col-span-4">
                          Referring: {g.merged.referringPhysicianName || "-"}
                        </div>
                        <div className="col-span-4">
                          First received:{" "}
                          {new Date(g.firstCreatedAt).toLocaleString()}
                        </div>
                      </div>
                      {/* Row 3 - File Location */}
                      <div className="grid grid-cols-12 mt-3 text-sm text-gray-800">
                        <div className="col-span-12">
                          <span className="font-medium text-gray-600">
                            Location:
                          </span>{" "}
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded break-all">
                            {(() => {
                              const base =
                                status?.outDir || `receives/${user?.id}`;
                              if (g.firstFilename.includes("/")) {
                                return `${base}/${g.firstFilename}`;
                              }
                              const maybeUID = g.merged?.studyInstanceUID;
                              if (maybeUID)
                                return `${base}/${maybeUID}/${g.firstFilename}`;
                              return `${base}/${g.firstFilename}`;
                            })()}
                          </span>
                          <div className="mt-1 text-xs text-gray-600">
                            {g.items.length}{" "}
                            {g.items.length === 1 ? "study" : "studies"} •{" "}
                            {g.count} {g.count === 1 ? "image" : "images"}
                          </div>
                        </div>
                      </div>
                      {/* Row 4 - Actions */}
                      <div className="grid grid-cols-12 mt-3 text-sm text-gray-800">
                        <div className="col-span-12 flex gap-2">
                          <button
                            onClick={() => viewMetadata(g.firstFilename)}
                            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs shadow-sm"
                          >
                            View Metadata
                          </button>
                          <button
                            onClick={async () => {
                              if (!user) return;
                              const relPath = g.firstFilename;
                              const relDir = relPath.includes("/")
                                ? relPath.substring(
                                    0,
                                    relPath.lastIndexOf("/") + 1
                                  )
                                : "";
                              await fetch("/api/files/open", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: user.id,
                                  scope: "received",
                                  relDir,
                                }),
                              });
                            }}
                            className="px-3.5 py-1.5 rounded bg-gray-700 hover:bg-gray-800 text-white text-xs shadow-sm"
                          >
                            Open Folder
                          </button>
                          <button
                            onClick={async () => {
                              const base =
                                status?.outDir || `receives/${user?.id}`;
                              const full = `${base}/${g.firstFilename}`;
                              try {
                                await navigator.clipboard.writeText(full);
                              } catch {}
                            }}
                            className="px-3.5 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 text-xs shadow-sm"
                            title="Copy full path"
                          >
                            Copy Path
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </main>
      {/* Centered metadata modal */}
      {metadata && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <div className="font-semibold">
                DICOM Metadata - {selectedFile}
              </div>
              <button
                onClick={() => setMetadata(null)}
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              {/* Show error message if metadata has error */}
              {metadata.error ? (
                <div className="text-center py-4 text-red-600 bg-red-50 rounded-lg">
                  <div className="font-medium">Error loading metadata:</div>
                  <div className="text-sm mt-1">{metadata.error}</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {/* ZIP File Information */}
                  {metadata.zipFile && (
                    <div className="bg-blue-50 rounded-lg p-4 col-span-full">
                      <h3 className="text-sm font-medium text-blue-900 mb-3">
                        ZIP File Information
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">ZIP File:</span>{" "}
                          {metadata.zipFile}
                        </div>
                        {metadata.extractedFrom && (
                          <div>
                            <span className="font-medium">Extracted from:</span>{" "}
                            {metadata.extractedFrom}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Patient Information */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Patient Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {metadata.patientName && (
                        <div>
                          <span className="font-medium">Name:</span>{" "}
                          {metadata.patientName}
                        </div>
                      )}
                      {metadata.patientId && (
                        <div>
                          <span className="font-medium">ID:</span>{" "}
                          {metadata.patientId}
                        </div>
                      )}
                      {metadata.patientSex && (
                        <div>
                          <span className="font-medium">Sex:</span>{" "}
                          {metadata.patientSex}
                        </div>
                      )}
                      {metadata.patientBirthDate && (
                        <div>
                          <span className="font-medium">Birth Date:</span>{" "}
                          {metadata.patientBirthDate}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Study Information */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Study Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {metadata.studyDate && (
                        <div>
                          <span className="font-medium">Date:</span>{" "}
                          {metadata.studyDate}
                        </div>
                      )}
                      {metadata.studyTime && (
                        <div>
                          <span className="font-medium">Time:</span>{" "}
                          {metadata.studyTime}
                        </div>
                      )}
                      {metadata.studyDescription && (
                        <div>
                          <span className="font-medium">Description:</span>{" "}
                          {metadata.studyDescription}
                        </div>
                      )}
                      {metadata.studyInstanceUID && (
                        <div>
                          <span className="font-medium">Study UID:</span>{" "}
                          <span className="text-xs text-gray-600 break-all">
                            {metadata.studyInstanceUID}
                          </span>
                        </div>
                      )}
                      {metadata.accessionNumber && (
                        <div>
                          <span className="font-medium">Accession:</span>{" "}
                          {metadata.accessionNumber}
                        </div>
                      )}
                      {metadata.modality && (
                        <div>
                          <span className="font-medium">Modality:</span>{" "}
                          {metadata.modality}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Series Information */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Series Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {metadata.seriesNumber && (
                        <div>
                          <span className="font-medium">Number:</span>{" "}
                          {metadata.seriesNumber}
                        </div>
                      )}
                      {metadata.seriesDescription && (
                        <div>
                          <span className="font-medium">Description:</span>{" "}
                          {metadata.seriesDescription}
                        </div>
                      )}
                      {metadata.seriesInstanceUID && (
                        <div>
                          <span className="font-medium">Series UID:</span>{" "}
                          <span className="text-xs text-gray-600 break-all">
                            {metadata.seriesInstanceUID}
                          </span>
                        </div>
                      )}
                      {metadata.bodyPartExamined && (
                        <div>
                          <span className="font-medium">Body Part:</span>{" "}
                          {metadata.bodyPartExamined}
                        </div>
                      )}
                      {metadata.instanceNumber && (
                        <div>
                          <span className="font-medium">Instance:</span>{" "}
                          {metadata.instanceNumber}
                        </div>
                      )}
                      {metadata.sopInstanceUID && (
                        <div>
                          <span className="font-medium">SOP UID:</span>{" "}
                          <span className="text-xs text-gray-600 break-all">
                            {metadata.sopInstanceUID}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Technical Information */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Technical Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {metadata.rows && (
                        <div>
                          <span className="font-medium">Rows:</span>{" "}
                          {metadata.rows}
                        </div>
                      )}
                      {metadata.columns && (
                        <div>
                          <span className="font-medium">Columns:</span>{" "}
                          {metadata.columns}
                        </div>
                      )}
                      {metadata.manufacturer && (
                        <div>
                          <span className="font-medium">Manufacturer:</span>{" "}
                          {metadata.manufacturer}
                        </div>
                      )}
                      {metadata.manufacturerModelName && (
                        <div>
                          <span className="font-medium">Model:</span>{" "}
                          {metadata.manufacturerModelName}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Institution Information */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Institution Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {metadata.institutionName && (
                        <div>
                          <span className="font-medium">Institution:</span>{" "}
                          {metadata.institutionName}
                        </div>
                      )}
                      {metadata.stationName && (
                        <div>
                          <span className="font-medium">Station:</span>{" "}
                          {metadata.stationName}
                        </div>
                      )}
                      {metadata.institutionalDepartmentName && (
                        <div>
                          <span className="font-medium">Department:</span>{" "}
                          {metadata.institutionalDepartmentName}
                        </div>
                      )}
                      {metadata.referringPhysicianName && (
                        <div>
                          <span className="font-medium">Physician:</span>{" "}
                          {metadata.referringPhysicianName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
