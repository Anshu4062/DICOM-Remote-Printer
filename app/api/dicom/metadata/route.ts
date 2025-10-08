import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { existsSync } from "fs";

const execAsync = promisify(exec);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { userId, filename, scope } = await req.json();

    if (!userId || !filename) {
      return NextResponse.json(
        { error: "Missing userId or filename" },
        { status: 400 }
      );
    }

    const baseDir =
      scope === "received"
        ? join(process.cwd(), "receives", userId)
        : join(process.cwd(), "uploads", userId);
    const filePath = join(baseDir, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Use dcmdump to extract DICOM metadata
    const command = `dcmdump "${filePath}"`;

    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      return NextResponse.json(
        { error: `dcmdump stderr: ${stderr}`, stdout },
        { status: 500 }
      );
    }

    // Parse the dcmdump output to extract key metadata
    const metadata = parseDicomMetadata(stdout);

    return NextResponse.json({
      success: true,
      metadata,
      rawOutput: stdout,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to extract metadata" },
      { status: 500 }
    );
  }
}

function parseDicomMetadata(dcmdumpOutput: string) {
  const lines = dcmdumpOutput.split("\n");
  const metadata: any = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Extract key metadata fields - look for the actual tag format
    if (trimmed.includes("(0010,0010)")) {
      metadata.patientName = extractValue(trimmed);
    } else if (trimmed.includes("(0010,0020)")) {
      metadata.patientId = extractValue(trimmed);
    } else if (trimmed.includes("(0010,0040)")) {
      metadata.patientSex = extractValue(trimmed);
    } else if (trimmed.includes("(0010,0030)")) {
      metadata.patientBirthDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0060)")) {
      metadata.modality = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0050)")) {
      metadata.accessionNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0020)")) {
      metadata.studyDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0030)")) {
      metadata.studyTime = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1030)")) {
      metadata.studyDescription = extractValue(trimmed);
    } else if (trimmed.includes("(0020,000D)")) {
      metadata.studyInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0011)")) {
      metadata.seriesNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0008,103E)")) {
      metadata.seriesDescription = extractValue(trimmed);
    } else if (trimmed.includes("(0020,000E)")) {
      metadata.seriesInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0061)")) {
      metadata.bodyPartExamined = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0013)")) {
      metadata.instanceNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0018)")) {
      metadata.sopInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0010)")) {
      metadata.rows = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0011)")) {
      metadata.columns = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0070)")) {
      metadata.manufacturer = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1090)")) {
      metadata.manufacturerModelName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1010)")) {
      metadata.stationName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0080)")) {
      metadata.institutionName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1040)")) {
      metadata.institutionalDepartmentName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0090)")) {
      metadata.referringPhysicianName = extractValue(trimmed);
    }
  }

  return metadata;
}

function extractValue(line: string): string {
  // Extract value from dcmdump output format
  // Format: (tag) VR [length] Value
  // Example: (0010,0010) PN [SIBONGISENI^MHLONGO]                    #  20, 1 PatientName

  // Look for content between square brackets
  const bracketMatch = line.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  // Fallback: look for content after the tag and VR
  const match = line.match(/\([^)]+\)\s+\w+\s+\[.*?\]\s+(.*?)(?:\s+#|$)/);
  if (match) {
    return match[1].trim();
  }

  return "";
}
