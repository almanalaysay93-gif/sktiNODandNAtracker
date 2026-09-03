import { describe, it, expect } from "vitest";
import {
  renderLicenseExpiryEmail,
  renderSeminarAnnouncementEmail,
  renderSeminarReminderEmail,
  renderProfileUpdateEmail,
  renderDirectNoticeEmail,
} from "./email/templates";
import { sendEmail } from "./email/service";

describe("Email Templates & Service", () => {
  it("renders license expiry template with branding and action button", () => {
    const html = renderLicenseExpiryEmail({
      nurseName: "Juan Dela Cruz",
      licenseType: "PRC Registered Nurse License",
      licenseNumber: "0123456",
      expiryDateStr: "2026-10-15",
      daysRemaining: 42,
      thresholdKey: "60d",
      actionUrl: "https://nursetrack.example.com/me",
    });
    expect(html).toContain("SKTI NurseTrack");
    expect(html).toContain("Juan Dela Cruz");
    expect(html).toContain("0123456");
    expect(html).toContain("42 days");
    expect(html).toContain("https://nursetrack.example.com/me");
  });

  it("renders seminar announcement template", () => {
    const html = renderSeminarAnnouncementEmail({
      nurseName: "Maria Santos",
      seminarTitle: "Advanced Peritoneal Dialysis & Infection Control",
      scheduledDateStr: "2026-09-20 08:00 AM",
      venue: "SPMC Nephrology Auditorium",
      hours: 8,
      cpdUnits: 5,
      actionUrl: "https://nursetrack.example.com/me",
    });
    expect(html).toContain("Maria Santos");
    expect(html).toContain("Advanced Peritoneal Dialysis");
    expect(html).toContain("SPMC Nephrology Auditorium");
    expect(html).toContain("5 CPD Units");
  });

  it("renders 48-hour seminar reminder template", () => {
    const html = renderSeminarReminderEmail({
      nurseName: "Maria Santos",
      seminarTitle: "Hemodialysis Water Treatment Protocols",
      scheduledDateStr: "2026-09-05 09:00 AM",
      venue: "RDU Training Room",
      actionUrl: "https://nursetrack.example.com/me",
    });
    expect(html).toContain("Reminder: Upcoming Seminar in 48 Hours");
    expect(html).toContain("Hemodialysis Water Treatment Protocols");
  });

  it("renders profile update template", () => {
    const html = renderProfileUpdateEmail({
      nurseName: "Juan Dela Cruz",
      updateTitle: "Area Assignment Updated",
      details: "You have been reassigned to RDU ANNEX effective 2026-09-01.",
      actionUrl: "https://nursetrack.example.com/me",
    });
    expect(html).toContain("Area Assignment Updated");
    expect(html).toContain("RDU ANNEX");
  });

  it("sends email in mock mode when RESEND_API_KEY is not configured", async () => {
    const result = await sendEmail({
      to: "staff.nurse@example.com",
      subject: "Test Mock Dispatch",
      html: "<p>Hello</p>",
      nurseId: 999,
      emailType: "manual_notice",
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe("mock_sent");
  });
});
