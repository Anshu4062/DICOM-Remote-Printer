// Utility function to apply anonymization settings to DICOM metadata
export function applyAnonymization(metadata: any, settings: any): any {
  if (!settings || !metadata) return metadata;

  const anonymized = { ...metadata };

  const defaultPrefix = (settings?.defaultPrefix || "***").trim() || "***";
  const customPrefix = (settings?.customPrefix || "").trim();
  const pickPrefix = (useCustom: boolean) =>
    useCustom && customPrefix ? customPrefix : defaultPrefix;

  // Apply anonymization based on settings (Generate XML does not mask fields)
  if (settings.anonymizeInstitutionName && anonymized.institutionName) {
    anonymized.institutionName = defaultPrefix;
  }

  if (
    settings.anonymizeInstitutionAddress &&
    anonymized.institutionalDepartmentName
  ) {
    anonymized.institutionalDepartmentName = defaultPrefix;
  }

  if (settings.anonymizePatientName && anonymized.patientName) {
    anonymized.patientName = pickPrefix(true);
  }

  if (settings.anonymizePatientId && anonymized.patientId) {
    anonymized.patientId = pickPrefix(true);
  }

  if (
    settings.anonymizeReferringPhysician &&
    anonymized.referringPhysicianName
  ) {
    anonymized.referringPhysicianName = defaultPrefix;
  }

  if (settings.anonymizeAccessionNumber && anonymized.accessionNumber) {
    anonymized.accessionNumber = defaultPrefix;
  }

  return anonymized;
}

// Function to get anonymization settings for a user
export async function getUserAnonymizationSettings(
  userId: string
): Promise<any> {
  try {
    const response = await fetch(`/api/admin/anonymization?userId=${userId}`);
    const data = await response.json();
    if (response.ok && data?.success) {
      return data.settings.settings || {};
    }
  } catch (error) {
    console.error("Failed to load anonymization settings:", error);
  }
  return {};
}
