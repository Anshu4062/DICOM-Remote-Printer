"use client";

import { useEffect, useState } from "react";
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
  const formatMeta = (m: any) => {
    if (!m) return [] as Array<{ k: string; v: string }>;
    const keys = [
      ["patientName", "Patient"],
      ["patientId", "Patient ID"],
      ["patientSex", "Sex"],
      ["patientBirthDate", "DOB"],
      ["modality", "Modality"],
      ["studyDate", "Study Date"],
      ["studyTime", "Study Time"],
      ["studyDescription", "Study Description"],
      ["seriesNumber", "Series #"],
      ["seriesDescription", "Series"],
      ["bodyPartExamined", "Body Part"],
      ["instanceNumber", "Instance #"],
      ["rows", "Rows"],
      ["columns", "Columns"],
      ["manufacturer", "Manufacturer"],
      ["manufacturerModelName", "Model"],
      ["stationName", "Station"],
      ["institutionName", "Institution"],
      ["institutionalDepartmentName", "Department"],
      ["referringPhysicianName", "Referring Physician"],
    ] as Array<[string, string]>;
    return keys
      .map(([k, label]) => ({ k: label, v: m?.[k] }))
      .filter((p) => !!p.v);
  };
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

        {/* History at bottom */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">
            Received History
          </h2>
          {!history?.length ? (
            <div className="text-sm text-gray-500">No entries yet.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Filename</th>
                    <th className="py-2 pr-4">Patient</th>
                    <th className="py-2 pr-4">Date/Time</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .filter((h) => h.action === "received")
                    .map((h) => (
                      <tr key={h._id} className="border-b">
                        <td className="py-2 pr-4">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            Received
                          </span>
                        </td>
                        <td className="py-2 pr-4 break-all">{h.filename}</td>
                        <td className="py-2 pr-4">
                          {h.metadata?.patientName || "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {new Date(h.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => viewMetadata(h.filename)}
                            className="px-2 py-1 text-xs rounded bg-blue-600 text-white"
                          >
                            View Metadata
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      {/* Centered metadata modal */}
      {metadata && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <div className="font-semibold">Metadata - {selectedFile}</div>
              <button
                onClick={() => setMetadata(null)}
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {formatMeta(metadata).map((p) => (
                <div key={p.k} className="rounded border p-2 bg-gray-50">
                  <div className="text-gray-500">{p.k}</div>
                  <div className="font-medium text-gray-900 break-words">
                    {p.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
