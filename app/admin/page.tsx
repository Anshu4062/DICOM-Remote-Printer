"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
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
  const [selectedDbEndpointId, setSelectedDbEndpointId] = useState<string>("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [users, setUsers] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      role?: string;
      createdAt?: string;
    }>
  >([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assignedMap, setAssignedMap] = useState<Record<string, string[]>>({});
  const [endpoints, setEndpoints] = useState<
    Array<{
      _id: string;
      name: string;
      calledAET: string;
      host: string;
      port: string;
    }>
  >([]);
  const [assigningUserId, setAssigningUserId] = useState<string>("");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>("");
  const [rowMenuOpenFor, setRowMenuOpenFor] = useState<string>("");
  const assignedSet = useMemo(() => {
    const all: string[] = [];
    Object.values(assignedMap).forEach((arr) => all.push(...arr));
    return new Set(all.map(String));
  }, [assignedMap]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [anonymizationSettings, setAnonymizationSettings] = useState<
    Record<string, any>
  >({});
  const [loadingSettings, setLoadingSettings] = useState<Set<string>>(
    new Set()
  );
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

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

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        if (res.ok && data?.success) setUsers(data.users || []);
      } catch {}
      setLoadingUsers(false);
    };
    loadUsers();
  }, []);

  useEffect(() => {
    const loadEndpoints = async () => {
      try {
        const res = await fetch("/api/admin/endpoints");
        const data = await res.json();
        if (res.ok && data?.success) setEndpoints(data.endpoints || []);
      } catch {}
    };
    loadEndpoints();
  }, []);

  const loadAssignments = async () => {
    try {
      const res = await fetch("/api/admin/user-endpoints");
      const data = await res.json();
      if (res.ok && data?.success && Array.isArray(data.links)) {
        const map: Record<string, string[]> = {};
        for (const l of data.links) {
          const uid = String(l.userId);
          const eid = String(l.endpointId);
          if (!map[uid]) map[uid] = [];
          map[uid].push(eid);
        }
        setAssignedMap(map);
      }
    } catch {}
  };

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAnonymizationSettings = async (userId: string) => {
    if (loadingSettings.has(userId)) return;

    setLoadingSettings((prev) => new Set(prev).add(userId));
    try {
      const res = await fetch(`/api/admin/user-settings?userId=${userId}`);
      const data = await res.json();
      if (res.ok && data?.success) {
        setAnonymizationSettings((prev) => ({
          ...prev,
          [userId]: data.settings?.settings || {},
        }));
      }
    } catch (error) {
      console.error("Failed to load anonymization settings:", error);
    } finally {
      setLoadingSettings((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const saveAnonymizationSettings = async (userId: string, settings: any) => {
    try {
      const res = await fetch("/api/admin/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, settings }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setAnonymizationSettings((prev) => ({
          ...prev,
          [userId]: settings,
        }));
        setToastMsg("Anonymization settings saved");
        setTimeout(() => setToastMsg(""), 1000);
      } else {
        setToastMsg(data.error || "Failed to save settings");
        setTimeout(() => setToastMsg(""), 1500);
      }
    } catch (error) {
      setToastMsg("Failed to save settings");
      setTimeout(() => setToastMsg(""), 1500);
    }
  };

  const toggleUserExpansion = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
      // Load settings when expanding
      loadAnonymizationSettings(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const handleSaveProfile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const name = `${peerHost || "host"}:${peerPort || "port"} (${
        calledAET || "AE"
      })`;
      const res = await fetch("/api/admin/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          calledAET,
          host: peerHost,
          port: peerPort,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success)
        throw new Error(data?.error || "Failed to save");
      // Refresh database endpoints so they appear immediately after reload
      try {
        const r = await fetch("/api/admin/endpoints");
        const d = await r.json();
        if (r.ok && d?.success) setEndpoints(d.endpoints || []);
      } catch {}
      setToastMsg("Saved endpoint");
      setTimeout(() => setToastMsg(""), 1000);
    } catch (e: any) {
      setToastMsg(e?.message || "Failed to save endpoint");
      setTimeout(() => setToastMsg(""), 1200);
    } finally {
      setIsSaving(false);
    }
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
              onClick={() => router.push("/dashboard?allowAdmin=1")}
              className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto py-6 px-12">
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

        <div className="bg-white shadow rounded-lg relative z-50 overflow-visible">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">
                Add AE Title
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative inline-block" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setProfileMenuOpen((v) => !v)}
                    className="inline-flex w-60 items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <span className="truncate">
                      {selectedDbEndpointId
                        ? (() => {
                            const ep = endpoints.find(
                              (e) =>
                                String(e._id) === String(selectedDbEndpointId)
                            );
                            return ep
                              ? `${ep.host}:${ep.port} (${ep.calledAET})`
                              : "Select saved AE Title…";
                          })()
                        : "Select saved AE Title…"}
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
                    <div className="absolute right-0 z-[9999] mt-2 w-72 origin-top-right rounded-lg bg-white p-2 text-sm shadow-2xl ring-1 ring-black/5 max-h-64 overflow-auto">
                      {endpoints.length === 0 && (
                        <div className="px-3 py-2 text-gray-500">
                          No saved endpoints
                        </div>
                      )}
                      {endpoints.map((ep) => (
                        <button
                          key={String(ep._id)}
                          onClick={() => {
                            setSelectedDbEndpointId(String(ep._id));
                            setCalledAET(ep.calledAET);
                            setPeerHost(ep.host);
                            setPeerPort(ep.port);
                            setProfileMenuOpen(false);
                          }}
                          className="block w-full rounded-md px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                        >
                          {ep.host}:{ep.port} ({ep.calledAET})
                        </button>
                      ))}
                      {endpoints.length > 0 && (
                        <button
                          onClick={() => {
                            setSelectedDbEndpointId("");
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
                {/* Add to directory removed as requested */}
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
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white overflow-hidden shadow rounded-lg relative z-10">
          <div className="px-4 py-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Users</h2>
              <div className="flex items-center gap-3 ml-auto">
                <input
                  type="text"
                  placeholder="Search name or email"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-60 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {loadingUsers && (
                  <div className="text-sm text-gray-500">Loading…</div>
                )}
              </div>
            </div>
            {users.length === 0 ? (
              <div className="text-sm text-gray-500">No users</div>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left w-40">Name</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left w-72">Endpoint</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">Assign Endpoint</th>
                    <th className="px-3 py-2 text-left w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((u) => (
                    <React.Fragment key={u.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2 w-40 truncate">{u.name}</td>
                        <td className="px-3 py-2">{u.email}</td>
                        <td className="px-3 py-2 w-72 align-top">
                          {/* Show endpoints already assigned to this user */}
                          {Array.isArray(assignedMap[u.id]) &&
                            assignedMap[u.id].length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {assignedMap[u.id].map((eid) => {
                                  const ep = endpoints.find(
                                    (e) => String(e._id) === String(eid)
                                  );
                                  if (!ep) return null;
                                  return (
                                    <span
                                      key={`${u.id}-${eid}`}
                                      className="inline-flex items-center gap-2 rounded-full bg-green-100 text-green-800 text-base px-4 py-1.5"
                                    >
                                      {ep.calledAET} ({ep.host}:{ep.port})
                                      <button
                                        onClick={async () => {
                                          try {
                                            await fetch(
                                              "/api/admin/user-endpoints",
                                              {
                                                method: "DELETE",
                                                headers: {
                                                  "Content-Type":
                                                    "application/json",
                                                },
                                                body: JSON.stringify({
                                                  userId: u.id,
                                                  endpointId: String(ep._id),
                                                }),
                                              }
                                            );
                                            await loadAssignments();
                                          } catch {}
                                        }}
                                        className="ml-2 rounded-lg bg-red-600 text-white px-2.5 py-2 text-base leading-none shadow-sm hover:bg-red-700"
                                        title="Remove"
                                      >
                                        X
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                        </td>
                        <td className="px-3 py-2">
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 relative">
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningUserId(u.id);
                                setRowMenuOpenFor(
                                  rowMenuOpenFor === u.id ? "" : u.id
                                );
                              }}
                              className="inline-flex w-80 items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <span className="truncate text-left max-w-[10rem]">
                                {assigningUserId === u.id && selectedEndpointId
                                  ? (() => {
                                      const id = selectedEndpointId;
                                      if (id.startsWith("db:")) {
                                        const ep = endpoints.find(
                                          (e) => `db:${e._id}` === id
                                        );
                                        return ep
                                          ? `${ep.calledAET} (${ep.host}:${ep.port})`
                                          : "Select endpoint…";
                                      }
                                      const pid = id.replace("local:", "");
                                      const p = profiles.find(
                                        (x) => x.id === pid
                                      );
                                      return p
                                        ? `${p.calledAET} (${p.host}:${p.port})`
                                        : "Select endpoint…";
                                    })()
                                  : "Select AE Title…"}
                              </span>
                              <svg
                                className={`ml-2 h-4 w-4 text-gray-500 transition-transform ${
                                  rowMenuOpenFor === u.id ? "rotate-180" : ""
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
                            {rowMenuOpenFor === u.id && (
                              <div className="absolute z-10 top-full mt-2 w-80 origin-top-left rounded-lg bg-white p-2 text-sm shadow-lg ring-1 ring-black/5 max-h-64 overflow-auto">
                                {endpoints
                                  .filter(
                                    (ep) => !assignedSet.has(String(ep._id))
                                  )
                                  .map((ep) => (
                                    <button
                                      key={`dbm:${ep._id}`}
                                      onClick={() => {
                                        setSelectedEndpointId(`db:${ep._id}`);
                                        setAssigningUserId(u.id);
                                        setRowMenuOpenFor("");
                                      }}
                                      className="block w-full rounded-md px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                                    >
                                      {ep.calledAET} ({ep.host}:{ep.port})
                                    </button>
                                  ))}

                                {profiles.map((p) => (
                                  <button
                                    key={`localm:${p.id}`}
                                    onClick={() => {
                                      setSelectedEndpointId(`local:${p.id}`);
                                      setAssigningUserId(u.id);
                                      setRowMenuOpenFor("");
                                    }}
                                    className="block w-full rounded-md px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={async () => {
                                if (!selectedEndpointId) return;
                                let endpointId = selectedEndpointId;
                                try {
                                  if (selectedEndpointId.startsWith("local:")) {
                                    const pid =
                                      selectedEndpointId.split(":")[1];
                                    const p = profiles.find(
                                      (x) => x.id === pid
                                    );
                                    if (!p) return;
                                    const name = `${p.calledAET} (${p.host}:${p.port})`;
                                    const createRes = await fetch(
                                      "/api/admin/endpoints",
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          name,
                                          calledAET: p.calledAET,
                                          host: p.host,
                                          port: p.port,
                                        }),
                                      }
                                    );
                                    const createData = await createRes.json();
                                    if (
                                      !createRes.ok ||
                                      !createData?.endpoint?._id
                                    ) {
                                      setToastMsg(
                                        createData?.error ||
                                          "Failed to add endpoint"
                                      );
                                      setTimeout(() => setToastMsg(""), 1200);
                                      return;
                                    }
                                    endpointId = `db:${createData.endpoint._id}`;
                                    // Refresh DB endpoints list
                                    try {
                                      const r = await fetch(
                                        "/api/admin/endpoints"
                                      );
                                      const d = await r.json();
                                      if (r.ok && d?.success)
                                        setEndpoints(d.endpoints || []);
                                    } catch {}
                                    // refresh assignments too
                                    await loadAssignments();
                                  }
                                  const dbId = endpointId.replace(/^db:/, "");
                                  await fetch("/api/admin/user-endpoints", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      userId: u.id,
                                      endpointId: dbId,
                                    }),
                                  });
                                  setToastMsg("Endpoint assigned");
                                  setTimeout(() => setToastMsg(""), 800);
                                  setAssigningUserId("");
                                  setSelectedEndpointId("");
                                  await loadAssignments();
                                } catch {
                                  setToastMsg("Assignment failed");
                                  setTimeout(() => setToastMsg(""), 1200);
                                }
                              }}
                              className="ml-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 shrink-0"
                            >
                              Add
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 w-20">
                          <button
                            onClick={() => toggleUserExpansion(u.id)}
                            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            {expandedUsers.has(u.id) ? "Hide" : "Settings"}
                          </button>
                        </td>
                      </tr>
                      {/* Anonymization Settings Row */}
                      {expandedUsers.has(u.id) && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="bg-white rounded-lg border p-4">
                              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                Anonymization Settings for {u.name}
                              </h3>
                              {loadingSettings.has(u.id) ? (
                                <div className="text-sm text-gray-500">
                                  Loading settings...
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {/* Compress Images removed (always enabled) */}

                                  {/* Institution Name */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-700">
                                      Institution Name
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          anonymizeInstitutionName:
                                            !anonymizationSettings[u.id]
                                              ?.anonymizeInstitutionName,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                        anonymizationSettings[u.id]
                                          ?.anonymizeInstitutionName
                                          ? "bg-blue-600"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          anonymizationSettings[u.id]
                                            ?.anonymizeInstitutionName
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Institution Address */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-700">
                                      Institution Address
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          anonymizeInstitutionAddress:
                                            !anonymizationSettings[u.id]
                                              ?.anonymizeInstitutionAddress,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                        anonymizationSettings[u.id]
                                          ?.anonymizeInstitutionAddress
                                          ? "bg-blue-600"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          anonymizationSettings[u.id]
                                            ?.anonymizeInstitutionAddress
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Patient Name */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-700">
                                      Patient Name
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          anonymizePatientName:
                                            !anonymizationSettings[u.id]
                                              ?.anonymizePatientName,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                        anonymizationSettings[u.id]
                                          ?.anonymizePatientName
                                          ? "bg-blue-600"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          anonymizationSettings[u.id]
                                            ?.anonymizePatientName
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Patient ID */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-700">
                                      Patient ID
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          anonymizePatientId:
                                            !anonymizationSettings[u.id]
                                              ?.anonymizePatientId,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                        anonymizationSettings[u.id]
                                          ?.anonymizePatientId
                                          ? "bg-blue-600"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          anonymizationSettings[u.id]
                                            ?.anonymizePatientId
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Referring Physician */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-700">
                                      Referring Physician
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          anonymizeReferringPhysician:
                                            !anonymizationSettings[u.id]
                                              ?.anonymizeReferringPhysician,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                        anonymizationSettings[u.id]
                                          ?.anonymizeReferringPhysician
                                          ? "bg-blue-600"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          anonymizationSettings[u.id]
                                            ?.anonymizeReferringPhysician
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Accession Number */}
                                  <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-700">
                                      Accession Number
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          anonymizeAccessionNumber:
                                            !anonymizationSettings[u.id]
                                              ?.anonymizeAccessionNumber,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                        anonymizationSettings[u.id]
                                          ?.anonymizeAccessionNumber
                                          ? "bg-blue-600"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          anonymizationSettings[u.id]
                                            ?.anonymizeAccessionNumber
                                            ? "translate-x-6"
                                            : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Custom Prefix */}
                                  <div className="flex items-center gap-3 col-span-full">
                                    <label className="text-sm text-gray-700">
                                      Custom Prefix (e.g., &quot;dubai health
                                      001&quot;)
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        anonymizationSettings[u.id]
                                          ?.customPrefix || ""
                                      }
                                      onChange={(e) => {
                                        const newSettings = {
                                          ...anonymizationSettings[u.id],
                                          customPrefix: e.target.value,
                                        };
                                        setAnonymizationSettings((prev) => ({
                                          ...prev,
                                          [u.id]: newSettings,
                                        }));
                                        saveAnonymizationSettings(
                                          u.id,
                                          newSettings
                                        );
                                      }}
                                      placeholder="Enter custom prefix"
                                      className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
                                    />
                                  </div>

                                  {/* Default Prefix removed: will apply automatically when anonymize is enabled unless a custom prefix is provided */}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
