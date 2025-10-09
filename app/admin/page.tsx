"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    role?: string;
  } | null>(null);
  const [callingAET, setCallingAET] = useState("");
  const [calledAET, setCalledAET] = useState("");
  const [peerHost, setPeerHost] = useState("");
  const [peerPort, setPeerPort] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [profiles, setProfiles] = useState<
    Array<{
      id: string;
      name: string;
      callingAET: string;
      calledAET: string;
      host: string;
      port: string;
    }>
  >([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      router.push("/login");
      return;
    }
    try {
      const u = JSON.parse(userData);
      setUser(u);
      if (u.role !== "admin") router.push("/dashboard");
    } catch {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("storescuProfiles") || "[]";
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setProfiles(parsed);
    } catch {}
  }, []);

  const handleSaveProfile = () => {
    if (isSaving) return;
    setIsSaving(true);
    setTimeout(() => {
      const id = Math.random().toString(36).slice(2);
      const name = `${peerHost || "host"}:${peerPort || "port"} (${
        calledAET || "AE"
      })`;
      const updated = [
        ...profiles,
        { id, name, callingAET, calledAET, host: peerHost, port: peerPort },
      ];
      setProfiles(updated);
      localStorage.setItem("storescuProfiles", JSON.stringify(updated));
      setSelectedProfileId(id);
      setToastMsg("Saved endpoint");
      setTimeout(() => setToastMsg(""), 1000);
      setIsSaving(false);
    }, 800);
  };

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setCallingAET(p.callingAET);
    setCalledAET(p.calledAET);
    setPeerHost(p.host);
    setPeerPort(p.port);
  };

  const handleDeleteProfile = () => {
    if (!selectedProfileId) return;
    const updated = profiles.filter((p) => p.id !== selectedProfileId);
    setProfiles(updated);
    localStorage.setItem("storescuProfiles", JSON.stringify(updated));
    setSelectedProfileId("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto px-20">
          <div className="flex justify-between items-center py-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
              <p className="text-gray-600">DICOM Network (C-STORE) Settings</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto py-6 px-20">
        {toastMsg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
              <div className="text-base font-semibold text-gray-900">
                {toastMsg}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                DICOM Network (C-STORE) Settings
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative inline-block" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setProfileMenuOpen((v) => !v)}
                    className="inline-flex w-60 items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <span className="truncate">
                      {selectedProfileId
                        ? profiles.find((p) => p.id === selectedProfileId)
                            ?.name || "Endpoint"
                        : "Select saved endpoint…"}
                    </span>
                    <svg
                      className={`ml-2 h-4 w-4 text-gray-500 transition-transform ${
                        profileMenuOpen ? "rotate-180" : ""
                      }`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.27a.75.75 0 01-.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {profileMenuOpen && (
                    <div className="absolute right-0 z-10 mt-2 w-72 origin-top-right rounded-lg bg-white p-2 text-sm shadow-lg ring-1 ring-black/5 max-h-64 overflow-auto">
                      {profiles.length === 0 && (
                        <div className="px-3 py-2 text-gray-500">
                          No saved endpoints
                        </div>
                      )}
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            handleSelectProfile(p.id);
                            setProfileMenuOpen(false);
                          }}
                          className="block w-full rounded-md px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                        >
                          {p.name}
                        </button>
                      ))}
                      {profiles.length > 0 && (
                        <button
                          onClick={() => {
                            setSelectedProfileId("");
                            setCallingAET("");
                            setCalledAET("");
                            setPeerHost("");
                            setPeerPort("");
                            setProfileMenuOpen(false);
                          }}
                          className="mt-1 block w-full rounded-md px-3 py-2 text-left text-gray-500 hover:bg-gray-50"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleDeleteProfile}
                  className="inline-flex items-center text-sm px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-6 whitespace-nowrap">
                  Your AE Title
                </label>
                <input
                  className="block w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 sm:text-sm px-3 py-2 transition"
                  value={callingAET}
                  onChange={(e) => setCallingAET(e.target.value)}
                  placeholder="Enter your AE title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-6 whitespace-nowrap">
                  Remote Server AE Title
                </label>
                <input
                  className="block w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 sm:text-sm px-3 py-2 transition"
                  value={calledAET}
                  onChange={(e) => setCalledAET(e.target.value)}
                  placeholder="Enter the remote AE title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-6 whitespace-nowrap">
                  Remote Peer Host
                </label>
                <input
                  className="block w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 sm:text-sm px-3 py-2 transition"
                  value={peerHost}
                  onChange={(e) => setPeerHost(e.target.value)}
                  placeholder="Enter the peer host"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-6 whitespace-nowrap">
                  Port
                </label>
                <input
                  className="block w-full rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500 sm:text-sm px-3 py-2 transition"
                  value={peerPort}
                  onChange={(e) => setPeerPort(e.target.value)}
                  placeholder="Enter the port"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                  isSaving
                    ? "bg-primary-400 cursor-not-allowed"
                    : "bg-primary-600 hover:bg-primary-700 focus:ring-primary-500"
                }`}
              >
                {isSaving ? "Saving…" : "Save Endpoint"}
              </button>
              <div className="text-sm text-gray-500 self-center">
                Saved endpoints are stored locally in your browser.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
