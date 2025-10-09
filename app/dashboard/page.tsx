"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  email: string;
}

interface ImageMetadata {
  patientName?: string;
  patientId?: string;
  patientSex?: string;
  patientBirthDate?: string;
  patientAge?: string;
  patientSize?: string;
  patientWeight?: string;
  patientComments?: string;
  modality?: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  performingPhysicianName?: string;
  seriesNumber?: string;
  seriesDescription?: string;
  bodyPartExamined?: string;
  instanceNumber?: string;
  rows?: string;
  columns?: string;
  manufacturer?: string;
  manufacturerModelName?: string;
  stationName?: string;
  institutionName?: string;
  institutionalDepartmentName?: string;
  referringPhysicianName?: string;
  operatorsName?: string;
  // Additional fields for UIDs and comprehensive metadata
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  sopClassUID?: string;
  accessionNumber?: string;
  studyId?: string;
  samplesPerPixel?: string;
  photometricInterpretation?: string;
  numberOfFrames?: string;
  pixelSpacing?: string;
  bitsAllocated?: string;
  bitsStored?: string;
  highBit?: string;
  pixelRepresentation?: string;
  windowCenter?: string;
  windowWidth?: string;
  rescaleIntercept?: string;
  rescaleSlope?: string;
  rescaleType?: string;
  instanceCreationTime?: string;
  instanceCreationDate?: string;
  seriesDate?: string;
  seriesTime?: string;
  acquisitionDate?: string;
  acquisitionTime?: string;
  contentDate?: string;
  contentTime?: string;
  deviceSerialNumber?: string;
  softwareVersions?: string;
  protocolName?: string;
  reconstructionDiameter?: string;
  gantryDetectorTilt?: string;
  tableHeight?: string;
  rotationDirection?: string;
  exposureTime?: string;
  xRayTubeCurrent?: string;
  exposure?: string;
  filterMaterial?: string;
  generatorPower?: string;
  focalSpots?: string;
  dateOfLastCalibration?: string;
  timeOfLastCalibration?: string;
  patientPosition?: string;
  viewPosition?: string;
  patientOrientation?: string;
  imageOrientationPatient?: string;
  imagePositionPatient?: string;
  sliceLocation?: string;
  imageComments?: string;
  imageLaterality?: string;
  imageType?: string;
  specificCharacterSet?: string;
  mediaStorageSOPClassUID?: string;
  mediaStorageSOPInstanceUID?: string;
  transferSyntaxUID?: string;
  implementationClassUID?: string;
  implementationVersionName?: string;
  // ZIP file specific fields
  zipFile?: string;
  extractedFrom?: string;
  error?: string;
}

interface HistoryEntry {
  _id: string;
  userId: string;
  filename: string;
  action: "uploaded" | "sent";
  metadata: ImageMetadata;
  endpoint?: {
    callingAET: string;
    calledAET: string;
    host: string;
    port: string;
  };
  createdAt: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  // storescu UI state (client-only)
  const [callingAET, setCallingAET] = useState("");
  const [calledAET, setCalledAET] = useState("");
  const [peerHost, setPeerHost] = useState("");
  const [peerPort, setPeerPort] = useState("");
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
  const fetchedMetaRef = useRef<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata | null>(
    null
  );
  const [rawMetadataText, setRawMetadataText] = useState<string>("");
  const [showAllTags, setShowAllTags] = useState<boolean>(false);
  const [showJson, setShowJson] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    filename: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const extractKeyFieldsFromRaw = useCallback((raw: string) => {
    if (!raw) return {} as Partial<ImageMetadata>;
    const pick = (tag: string) => {
      // Matches: (0020,000D) UI [value]  OR  (0020,000D) UI =Name [value]
      const re = new RegExp(
        `\\(${tag}\\)\\s+\\w+\\s+(?:=[^\\[]+\\s+)?\\[([^\\]]+)\\]`,
        "i"
      );
      const m = raw.match(re);
      return m ? m[1].trim() : undefined;
    };
    const extracted = {
      studyInstanceUID: pick("0020,000d"),
      seriesInstanceUID: pick("0020,000e"),
      studyId: pick("0020,0010"),
      modality: pick("0008,0060"),
    } as Partial<ImageMetadata>;
    return Object.fromEntries(
      Object.entries(extracted).filter(([, v]) => v && String(v).length > 0)
    ) as Partial<ImageMetadata>;
  }, []);
  const [isMetaOpen, setIsMetaOpen] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [patientByFilename, setPatientByFilename] = useState<
    Record<string, string>
  >({});
  const groups = React.useMemo(() => {
    const byPatient: Record<string, HistoryEntry[]> = {};
    for (const entry of history) {
      const pid = (entry.metadata?.patientId || "").trim();
      const key = pid || `__nofpid__:${entry._id}`;
      if (!byPatient[key]) byPatient[key] = [];
      byPatient[key].push(entry);
    }
    // Sort each group by createdAt desc
    const groupList = Object.entries(byPatient).map(([key, items]) => {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const ref = items[0];
      const nameGuess =
        patientByFilename[ref.filename] || ref.metadata?.patientName || "-";
      const id = ref.metadata?.patientId || "";
      return { key, items, displayName: nameGuess, displayId: id };
    });
    // Keep overall order by newest in each group
    groupList.sort((a, b) => {
      const at = new Date(a.items[0].createdAt).getTime();
      const bt = new Date(b.items[0].createdAt).getTime();
      return bt - at;
    });
    return groupList;
  }, [history, patientByFilename]);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/login");
      return;
    }

    try {
      setUser(JSON.parse(userData));
    } catch (error) {
      console.error("Error parsing user data:", error);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Load saved storescu profiles on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("storescuProfiles") || "[]";
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setProfiles(parsed);
      }
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`/api/history?userId=${user.id}`);
      const data = await response.json();
      if (data.success) {
        // Merge cached JSON metadata (if present on server) for stability
        const mergedHistory = (data.history as HistoryEntry[]).map((h) => ({
          ...h,
          metadata: { ...(h.metadata || {}) },
        }));
        setHistory((prev) => {
          const sameLength = prev.length === mergedHistory.length;
          if (sameLength) {
            let allSame = true;
            for (let i = 0; i < prev.length; i++) {
              const a = prev[i];
              const b = mergedHistory[i];
              if (!a || !b) {
                allSame = false;
                break;
              }
              const metaA = JSON.stringify(a.metadata || {});
              const metaB = JSON.stringify(b.metadata || {});
              if (a._id !== b._id || metaA !== metaB) {
                allSame = false;
                break;
              }
            }
            if (allSame) return prev;
          }
          return mergedHistory;
        });
        // Seed any known patient names from stored metadata
        const seeded: Record<string, string> = {};
        for (const entry of data.history as HistoryEntry[]) {
          const patientName = entry?.metadata?.patientName;
          if (patientName) {
            seeded[entry.filename] = patientName;
          }
        }
        if (Object.keys(seeded).length) {
          setPatientByFilename((prev) => ({ ...prev, ...seeded }));
        }
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  }, [user?.id]);

  // Load image history on mount
  useEffect(() => {
    if (user?.id) {
      loadHistory();
    }
  }, [user, loadHistory]);

  // Disable background metadata population to avoid flicker; server returns merged cache
  const loadAllMetadata = useCallback(async () => {
    return;
  }, []);

  // No-op: avoid client re-fetches that cause flicker
  useEffect(() => {
    return;
  }, [history.length, loadAllMetadata]);

  const loadImageMetadata = async (filename: string) => {
    if (!user?.id) return;
    setLoadingMetadata(true);
    try {
      const response = await fetch("/api/dicom/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, filename }),
      });
      const data = await response.json();
      if (data.success) {
        const fallback = extractKeyFieldsFromRaw(data.raw || "");
        const mergedMeta = {
          ...(data.metadata || {}),
          ...fallback,
        } as ImageMetadata;
        setImageMetadata(mergedMeta);
        setRawMetadataText(data.raw || "");
        setIsMetaOpen(true);
        // Update the history row in place so Study/Series UIDs and Study ID appear immediately
        setHistory((prev) =>
          prev.map((h) =>
            h.filename === filename
              ? { ...h, metadata: { ...(h.metadata || {}), ...mergedMeta } }
              : h
          )
        );
        if (mergedMeta?.patientName) {
          setPatientByFilename((prev) => ({
            ...prev,
            [filename]: mergedMeta.patientName as string,
          }));
        }
      } else {
        setImageMetadata(null);
        setRawMetadataText("");
      }
    } catch (error) {
      console.error("Failed to load metadata:", error);
      setImageMetadata(null);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // Fetch patient names in background for rows missing it
  const fetchPatientNameSilently = useCallback(
    async (filename: string) => {
      if (!user?.id) return;
      try {
        const res = await fetch("/api/dicom/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, filename }),
        });
        const data = await res.json();
        if (res.ok && data?.metadata?.patientName) {
          setPatientByFilename((prev) => ({
            ...prev,
            [filename]: data.metadata.patientName as string,
          }));
        }
      } catch (_) {
        // ignore
      }
    },
    [user?.id]
  );

  // No background patient-name backfill; rely on cache for stability
  useEffect(() => {
    return;
  }, [history, patientByFilename, fetchPatientNameSilently]);

  // Close the profile dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [profileMenuOpen]);

  const handleSaveProfile = () => {
    if (isSaving) return; // cooldown active
    setIsSaving(true);
    setTimeout(() => {
      // Always create a new profile so previous ones remain in the list
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

      // Show success toast
      const ae = callingAET || "AE";
      setToastMsg(`Saved: ${ae}`);
      setTimeout(() => setToastMsg(""), 800);
      setIsSaving(false);
    }, 1000);
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

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Allow DICOM files (with or without extension) and ZIP archives
    const allowedExtensions = [
      ".dcm",
      ".dicom",
      ".DCM",
      ".DICOM",
      ".zip",
      ".ZIP",
      "",
    ]; // empty covers files without extension
    const lastDot = file.name.lastIndexOf(".");
    const fileExtension = lastDot >= 0 ? file.name.substring(lastDot) : "";

    setUploading(true);
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", user?.id || "");

      const response = await fetch("/api/upload/dicom", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadMessage("DICOM file uploaded successfully!");
        loadHistory(); // Refresh history after upload
      } else {
        setUploadMessage(data.error || "Upload failed");
      }
    } catch (error) {
      setUploadMessage("An error occurred during upload");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto px-20">
          <div className="flex justify-between items-center py-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome, {user.name}!
              </h1>
              <p className="text-gray-600">{user.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/receive")}
                className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Receive Images
              </button>
              <button
                onClick={async () => {
                  if (!user) return;
                  // Start/stop toggle based on current status
                  const statusRes = await fetch("/api/dicom/scp/status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: user.id }),
                  });
                  const status = await statusRes.json();
                  if (!status.running) {
                    const ae = callingAET || "RECEIVER";
                    const port = Number(peerPort) || 11112;
                    const res = await fetch("/api/dicom/scp/start", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userId: user.id,
                        aeTitle: ae,
                        port,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setToastMsg(`Listening as ${data.ae} on :${data.port}`);
                      setTimeout(() => setToastMsg(""), 1200);
                    } else {
                      setToastMsg(data.error || "Failed to start listener");
                      setTimeout(() => setToastMsg(""), 1500);
                    }
                  } else {
                    const res = await fetch("/api/dicom/scp/stop", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: user.id }),
                    });
                    if (res.ok) {
                      setToastMsg("Listener stopped");
                      setTimeout(() => setToastMsg(""), 1000);
                    }
                  }
                }}
                className="hidden"
              />
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal - outside metadata modal so it shows in all contexts */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !isDeleting && setDeleteTarget(null)}
            />
            <div className="relative max-w-md mx-auto mt-24 bg-white rounded-lg shadow-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete item
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                This will permanently delete the history entry and associated
                files for
                <span className="font-mono break-all">
                  {" "}
                  {deleteTarget.filename}
                </span>
                .
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!user?.id || !deleteTarget) return;
                    setIsDeleting(true);
                    try {
                      const res = await fetch(
                        `/api/history?userId=${user.id}&id=${deleteTarget.id}`,
                        { method: "DELETE" }
                      );
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setHistory((prev) =>
                          prev.filter((h) => h._id !== deleteTarget.id)
                        );
                        setDeleteTarget(null);
                      } else {
                        alert(data.error || "Failed to delete");
                      }
                    } catch {
                      alert("Failed to delete");
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto py-6 px-20">
        {toastMsg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-6 w-6 text-green-600"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10.28 15.22a.75.75 0 01-1.06 0l-3-3a.75.75 0 111.06-1.06l2.47 2.47 5.47-5.47a.75.75 0 111.06 1.06l-6 6z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">
                    Saved
                  </div>
                  <div className="mt-1 text-sm text-gray-600">{toastMsg}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg transition-shadow duration-200 hover:shadow-md">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Upload DICOM Images
              </h2>

              <div className="group border-2 border-dashed border-gray-300 rounded-lg p-6 transition-colors duration-200 hover:border-primary-300">
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 transition-colors duration-200 group-hover:text-primary-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="mt-4">
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-700 transition-colors duration-150 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                    >
                      <span>Upload DICOM file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept=".dcm,.dicom,.zip,application/zip,*/*"
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    DICOM files (.dcm or without extension) or ZIP archives
                    containing DICOMs
                  </p>
                </div>
              </div>

              {uploading && (
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Uploading...
                  </div>
                </div>
              )}

              {uploadMessage && (
                <div
                  className={`mt-4 text-center text-sm ${
                    uploadMessage.includes("successfully")
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {uploadMessage}
                </div>
              )}
            </div>
          </div>

          {/* DICOM Network (storescu) Settings - temporarily hidden for screenshot */}
          {false && (
            <div className="mt-6 bg-white overflow-hidden shadow rounded-lg transition-shadow duration-200 hover:shadow-md">
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
                  <button
                    onClick={async () => {
                      if (!user) return;
                      const res = await fetch("/api/dicom/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          userId: user.id,
                          callingAET,
                          calledAET,
                          host: peerHost,
                          port: peerPort,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setToastMsg("C-STORE sent");
                        setTimeout(() => setToastMsg(""), 1000);
                        loadHistory(); // Refresh history after send
                      } else {
                        const details =
                          data.stderr ||
                          data.stdout ||
                          data.error ||
                          "Send failed";
                        setToastMsg(details.slice(0, 300));
                        setTimeout(() => setToastMsg(""), 2000);
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-700 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600"
                  >
                    Send Imagesimage.png
                  </button>
                  <div className="text-sm text-gray-500 self-center">
                    Saved endpoints are stored locally in your browser.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Additional Dashboard Features */}
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-6 w-6 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Uploaded Images
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {history.filter((h) => h.action === "uploaded").length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-6 w-6 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Reports Generated
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {history.filter((h) => h.action === "sent").length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-6 w-6 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Last Activity
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        Today
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Image Metadata Modal */}
          {selectedImage && (
            <div className={`fixed inset-0 z-50 ${isMetaOpen ? "" : "hidden"}`}>
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setIsMetaOpen(false)}
              />
              <div className="relative max-w-5xl mx-auto mt-10 bg-white rounded-lg shadow-xl p-6 max-h-[80vh] overflow-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900">
                    DICOM Metadata - {selectedImage}
                  </h2>
                  <div className="flex items-center gap-2">
                    {rawMetadataText && (
                      <button
                        onClick={() => {
                          setShowAllTags((s) => !s);
                          if (!showAllTags) setShowJson(false);
                        }}
                        className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
                      >
                        {showAllTags ? "Key fields" : "View all"}
                      </button>
                    )}
                    {imageMetadata && (
                      <button
                        onClick={() => {
                          setShowJson((s) => !s);
                          if (!showJson) setShowAllTags(false);
                        }}
                        className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
                      >
                        {showJson ? "Key fields" : "Show JSON"}
                      </button>
                    )}
                    <button
                      onClick={() => setIsMetaOpen(false)}
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                    >
                      Close
                    </button>
                  </div>
                </div>
                {loadingMetadata ? (
                  <div className="text-center py-4 text-gray-500">
                    Loading metadata...
                  </div>
                ) : showAllTags && rawMetadataText ? (
                  <div className="bg-gray-900 text-gray-100 rounded-md p-3 text-xs overflow-auto max-h-[65vh] whitespace-pre font-mono">
                    {rawMetadataText}
                  </div>
                ) : showJson && imageMetadata ? (
                  <div className="bg-gray-900 text-gray-100 rounded-md p-3 text-xs overflow-auto max-h-[65vh] whitespace-pre font-mono">
                    {JSON.stringify(imageMetadata, null, 2)}
                  </div>
                ) : imageMetadata ? (
                  <div>
                    {/* Show error message if metadata has error */}
                    {imageMetadata.error ? (
                      <div className="text-center py-4 text-red-600 bg-red-50 rounded-lg">
                        <div className="font-medium">
                          Error loading metadata:
                        </div>
                        <div className="text-sm mt-1">
                          {imageMetadata.error}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {/* ZIP File Information */}
                        {imageMetadata.zipFile && (
                          <div className="bg-blue-50 rounded-lg p-4 col-span-full">
                            <h3 className="text-sm font-medium text-blue-900 mb-3">
                              ZIP File Information
                            </h3>
                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="font-medium">ZIP File:</span>{" "}
                                {imageMetadata.zipFile}
                              </div>
                              {imageMetadata.extractedFrom && (
                                <div>
                                  <span className="font-medium">
                                    Extracted from:
                                  </span>{" "}
                                  {imageMetadata.extractedFrom}
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
                            {imageMetadata.patientName && (
                              <div>
                                <span className="font-medium">Name:</span>{" "}
                                {imageMetadata.patientName}
                              </div>
                            )}
                            {imageMetadata.patientId && (
                              <div>
                                <span className="font-medium">ID:</span>{" "}
                                {imageMetadata.patientId}
                              </div>
                            )}
                            {imageMetadata.patientSex && (
                              <div>
                                <span className="font-medium">Sex:</span>{" "}
                                {imageMetadata.patientSex}
                              </div>
                            )}
                            {imageMetadata.patientBirthDate && (
                              <div>
                                <span className="font-medium">Birth Date:</span>{" "}
                                {imageMetadata.patientBirthDate}
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
                            {imageMetadata.studyDate && (
                              <div>
                                <span className="font-medium">Date:</span>{" "}
                                {imageMetadata.studyDate}
                              </div>
                            )}
                            {imageMetadata.studyTime && (
                              <div>
                                <span className="font-medium">Time:</span>{" "}
                                {imageMetadata.studyTime}
                              </div>
                            )}
                            {imageMetadata.studyDescription && (
                              <div>
                                <span className="font-medium">
                                  Description:
                                </span>{" "}
                                {imageMetadata.studyDescription}
                              </div>
                            )}
                            {imageMetadata.studyInstanceUID && (
                              <div>
                                <span className="font-medium">Study UID:</span>{" "}
                                <span className="text-xs text-gray-600 break-all">
                                  {imageMetadata.studyInstanceUID}
                                </span>
                              </div>
                            )}
                            {imageMetadata.accessionNumber && (
                              <div>
                                <span className="font-medium">Accession:</span>{" "}
                                {imageMetadata.accessionNumber}
                              </div>
                            )}
                            {imageMetadata.modality && (
                              <div>
                                <span className="font-medium">Modality:</span>{" "}
                                {imageMetadata.modality}
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
                            {imageMetadata.seriesNumber && (
                              <div>
                                <span className="font-medium">Number:</span>{" "}
                                {imageMetadata.seriesNumber}
                              </div>
                            )}
                            {imageMetadata.seriesDescription && (
                              <div>
                                <span className="font-medium">
                                  Description:
                                </span>{" "}
                                {imageMetadata.seriesDescription}
                              </div>
                            )}
                            {imageMetadata.seriesInstanceUID && (
                              <div>
                                <span className="font-medium">Series UID:</span>{" "}
                                <span className="text-xs text-gray-600 break-all">
                                  {imageMetadata.seriesInstanceUID}
                                </span>
                              </div>
                            )}
                            {imageMetadata.bodyPartExamined && (
                              <div>
                                <span className="font-medium">Body Part:</span>{" "}
                                {imageMetadata.bodyPartExamined}
                              </div>
                            )}
                            {imageMetadata.instanceNumber && (
                              <div>
                                <span className="font-medium">Instance:</span>{" "}
                                {imageMetadata.instanceNumber}
                              </div>
                            )}
                            {imageMetadata.sopInstanceUID && (
                              <div>
                                <span className="font-medium">SOP UID:</span>{" "}
                                <span className="text-xs text-gray-600 break-all">
                                  {imageMetadata.sopInstanceUID}
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
                            {imageMetadata.rows && (
                              <div>
                                <span className="font-medium">Rows:</span>{" "}
                                {imageMetadata.rows}
                              </div>
                            )}
                            {imageMetadata.columns && (
                              <div>
                                <span className="font-medium">Columns:</span>{" "}
                                {imageMetadata.columns}
                              </div>
                            )}
                            {imageMetadata.manufacturer && (
                              <div>
                                <span className="font-medium">
                                  Manufacturer:
                                </span>{" "}
                                {imageMetadata.manufacturer}
                              </div>
                            )}
                            {imageMetadata.manufacturerModelName && (
                              <div>
                                <span className="font-medium">Model:</span>{" "}
                                {imageMetadata.manufacturerModelName}
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
                            {imageMetadata.stationName && (
                              <div>
                                <span className="font-medium">Station:</span>{" "}
                                {imageMetadata.stationName}
                              </div>
                            )}
                            {imageMetadata.institutionName && (
                              <div>
                                <span className="font-medium">
                                  Institution:
                                </span>{" "}
                                {imageMetadata.institutionName}
                              </div>
                            )}
                            {imageMetadata.institutionalDepartmentName && (
                              <div>
                                <span className="font-medium">Department:</span>{" "}
                                {imageMetadata.institutionalDepartmentName}
                              </div>
                            )}
                            {imageMetadata.referringPhysicianName && (
                              <div>
                                <span className="font-medium">Physician:</span>{" "}
                                {imageMetadata.referringPhysicianName}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    No metadata available for this image
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Image History */}
          <div className="mt-6 bg-white overflow-hidden shadow rounded-lg">
            <div className="px-6 py-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">
                  Image History
                </h2>
                <button
                  onClick={async () => {
                    if (!user?.id) return;
                    setIsDeleting(true);
                    try {
                      const res = await fetch(
                        `/api/history?userId=${user.id}&all=true`,
                        { method: "DELETE" }
                      );
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setHistory([]);
                      } else {
                        alert(data.error || "Failed to clear history");
                      }
                    } catch {
                      alert("Failed to clear history");
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="px-3 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                >
                  {isDeleting ? "Clearing…" : "Clear All"}
                </button>
              </div>
              {user && (
                <div className="mb-3 text-sm text-gray-600">
                  <span className="font-medium">
                    Your AE/Port for receiving:
                  </span>{" "}
                  <span className="text-gray-900">
                    {callingAET || "RECEIVER"}
                  </span>{" "}
                  on port{" "}
                  <span className="text-gray-900">
                    {Number(peerPort) || 11112}
                  </span>
                </div>
              )}

              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No image history available
                </div>
              ) : (
                <div>
                  <table className="w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider w-48">
                          Filename
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                          Patient Info
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                          Study Details
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">
                          Date/Time
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">
                          Endpoint
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider w-40">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groups.map((group) => (
                        <React.Fragment key={group.key}>
                          {/* Group header: Patient */}
                          <tr className="bg-gray-100/70">
                            <td colSpan={7} className="px-4 py-2">
                              <div className="flex items-baseline gap-3">
                                <div className="text-base font-semibold text-gray-900">
                                  {group.displayName}
                                </div>
                                {group.displayId && (
                                  <div className="text-sm text-gray-600">
                                    ID:{" "}
                                    <span className="font-medium">
                                      {group.displayId}
                                    </span>
                                  </div>
                                )}
                                <div className="ml-auto text-xs text-gray-500">
                                  {group.items.length}{" "}
                                  {group.items.length === 1
                                    ? "study"
                                    : "studies"}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {group.items.map((entry) => {
                            const patientName =
                              patientByFilename[entry.filename] ||
                              entry.metadata?.patientName ||
                              "-";
                            const patientId = entry.metadata?.patientId || "-";
                            const modality = entry.metadata?.modality || "-";
                            const studyDesc =
                              entry.metadata?.studyDescription || "-";
                            const site =
                              entry.metadata?.institutionName ||
                              entry.metadata?.stationName ||
                              "-";
                            const sex = entry.metadata?.patientSex || "-";
                            const age = entry.metadata?.patientBirthDate
                              ? new Date().getFullYear() -
                                parseInt(
                                  entry.metadata.patientBirthDate.substring(
                                    0,
                                    4
                                  )
                                )
                              : "-";
                            const studyUID =
                              entry.metadata?.studyInstanceUID || "-";
                            const seriesUID =
                              entry.metadata?.seriesInstanceUID || "-";
                            const studyIdVal = entry.metadata?.studyId || "-";
                            const accessionNumber =
                              entry.metadata?.accessionNumber || "-";
                            const referringPhysician =
                              entry.metadata?.referringPhysicianName || "-";

                            return (
                              <React.Fragment key={entry._id}>
                                {/* Row 1: Main Info */}
                                <tr className="hover:bg-gray-50 border-b border-gray-200">
                                  <td
                                    className="px-4 py-3 whitespace-nowrap"
                                    rowSpan={3}
                                  >
                                    <span
                                      className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                                        entry.action === "uploaded"
                                          ? "bg-blue-100 text-blue-800"
                                          : "bg-green-100 text-green-800"
                                      }`}
                                    >
                                      {entry.action === "uploaded"
                                        ? "Uploaded"
                                        : "Sent"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium w-48">
                                    <div
                                      className="text-sm truncate max-w-[12rem]"
                                      title={entry.filename}
                                    >
                                      {entry.filename}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-gray-900">
                                    <div className="text-lg font-semibold text-gray-900">
                                      {patientName}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                      ID:{" "}
                                      <span className="font-medium">
                                        {patientId}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-gray-900">
                                    <div className="text-lg font-semibold text-blue-700">
                                      {modality}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                      {studyDesc}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                    <div className="text-sm font-medium">
                                      {new Date(
                                        entry.createdAt
                                      ).toLocaleDateString()}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {new Date(
                                        entry.createdAt
                                      ).toLocaleTimeString()}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 hidden md:table-cell">
                                    {entry.endpoint ? (
                                      <div className="text-sm">
                                        <div className="font-medium">
                                          {entry.endpoint.calledAET}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                          {entry.endpoint.host}:
                                          {entry.endpoint.port}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                          From: {entry.endpoint.callingAET}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td
                                    className="px-4 py-3 whitespace-nowrap font-medium w-40"
                                    rowSpan={3}
                                  >
                                    <div className="flex flex-col gap-1.5 items-center">
                                      <button
                                        onClick={() => {
                                          setSelectedImage(entry.filename);
                                          setIsMetaOpen(true);
                                          loadImageMetadata(entry.filename);
                                        }}
                                        className="w-full inline-flex items-center justify-center px-1.5 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 transition-colors"
                                      >
                                        View Metadata
                                      </button>
                                      <button
                                        onClick={() =>
                                          setDeleteTarget({
                                            id: entry._id,
                                            filename: entry.filename,
                                          })
                                        }
                                        className="w-full inline-flex items-center justify-center px-1.5 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* Row 2: Demographics & Study Info */}
                                <tr className="hover:bg-gray-50 bg-gray-50/30 border-b border-gray-100">
                                  <td className="px-4 py-2 text-gray-600 text-sm">
                                    {/* Empty for alignment */}
                                  </td>
                                  <td className="px-4 py-2 text-gray-700">
                                    <div className="text-sm">
                                      <span className="font-medium text-gray-600">
                                        Sex:
                                      </span>
                                      <span className="ml-1 font-semibold">
                                        {sex}
                                      </span>
                                      <span className="mx-2 text-gray-400">
                                        |
                                      </span>
                                      <span className="font-medium text-gray-600">
                                        Age:
                                      </span>
                                      <span className="ml-1 font-semibold">
                                        {age}
                                      </span>
                                    </div>
                                    <div className="text-sm mt-1">
                                      <span className="font-medium text-gray-600">
                                        Referring:
                                      </span>
                                      <span className="ml-1 font-medium text-gray-800">
                                        {referringPhysician}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-gray-700">
                                    <div className="text-sm">
                                      <span className="font-medium text-gray-600">
                                        Accession:
                                      </span>
                                      <span className="ml-1 font-mono font-semibold text-gray-800">
                                        {accessionNumber}
                                      </span>
                                    </div>
                                    <div className="text-sm mt-1">
                                      <span className="font-medium text-gray-600">
                                        Study ID:
                                      </span>
                                      <span className="ml-1 font-mono font-semibold text-gray-800">
                                        {studyIdVal}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-gray-600 text-sm">
                                    <span className="font-medium">Type:</span>{" "}
                                    Medical Image
                                  </td>
                                  <td className="px-4 py-2 text-gray-500 hidden md:table-cell">
                                    {/* Empty for alignment */}
                                  </td>
                                </tr>

                                {/* Row 3: Technical Details & UIDs */}
                                <tr className="hover:bg-gray-50 bg-blue-50/20 border-t border-blue-200">
                                  <td className="px-4 py-2 text-gray-600 text-sm">
                                    <span className="font-medium">Status:</span>{" "}
                                    Processed
                                  </td>
                                  <td className="px-4 py-2 text-gray-700">
                                    <div className="text-sm mb-2">
                                      <span className="font-medium text-gray-600">
                                        Site:
                                      </span>
                                      <span className="ml-1 text-gray-800">
                                        {site}
                                      </span>
                                    </div>
                                    <div className="text-xs">
                                      <div className="font-medium text-gray-600 mb-1">
                                        Study UID
                                      </div>
                                      <div className="font-mono text-gray-800 break-all leading-tight bg-white p-2 rounded border text-xs">
                                        {studyUID}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-gray-700">
                                    <div className="text-sm mb-2">
                                      <span className="font-medium text-gray-600">
                                        Station:
                                      </span>
                                      <span className="ml-1 text-gray-800">
                                        {entry.metadata?.stationName || "-"}
                                      </span>
                                    </div>
                                    <div className="text-xs">
                                      <div className="font-medium text-gray-600 mb-1">
                                        Series UID
                                      </div>
                                      <div className="font-mono text-gray-800 break-all leading-tight bg-white p-2 rounded border text-xs">
                                        {seriesUID}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-gray-600 text-sm">
                                    <span className="font-medium">Status:</span>{" "}
                                    Processed
                                  </td>
                                  <td className="px-4 py-2 text-gray-500 hidden md:table-cell">
                                    {/* Empty for alignment */}
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
