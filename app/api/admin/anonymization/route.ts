import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import AnonymizationSettings from "@/models/AnonymizationSettings";

export const runtime = "nodejs";

// Get anonymization settings for a user
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const settings = await AnonymizationSettings.findOne({ userId });

    return NextResponse.json({
      success: true,
      settings: settings || {
        userId,
        settings: {
          compressImages: false,
          anonymizeInstitutionName: false,
          anonymizeInstitutionAddress: false,
          anonymizePatientName: false,
          anonymizePatientId: false,
          anonymizeReferringPhysician: false,
          generateXML: false,
          anonymizeAccessionNumber: false,
          customPrefix: "",
          defaultPrefix: "***",
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to get settings" },
      { status: 500 }
    );
  }
}

// Update anonymization settings for a user
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { userId, settings } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const updatedSettings = await AnonymizationSettings.findOneAndUpdate(
      { userId },
      {
        userId,
        settings: {
          compressImages: settings.compressImages || false,
          anonymizeInstitutionName: settings.anonymizeInstitutionName || false,
          anonymizeInstitutionAddress:
            settings.anonymizeInstitutionAddress || false,
          anonymizePatientName: settings.anonymizePatientName || false,
          anonymizePatientId: settings.anonymizePatientId || false,
          anonymizeReferringPhysician:
            settings.anonymizeReferringPhysician || false,
          generateXML: settings.generateXML || false,
          anonymizeAccessionNumber: settings.anonymizeAccessionNumber || false,
          customPrefix: settings.customPrefix || "",
          defaultPrefix: settings.defaultPrefix || "***",
        },
        updatedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}
