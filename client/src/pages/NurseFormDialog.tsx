import { AreaSelect } from "@/components/nursetrack/AreaSelect";
import { FileUploadButton, pickFile } from "@/components/nursetrack/FileUpload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { EMPLOYMENT_STATUSES, STAFF_TYPES, nurseFullName } from "../../../shared/nursetrack";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface NurseEditData {
  id: number;
  employeeId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  position?: string | null;
  staffType?: string | null;
  employmentStatus?: string | null;
  dateHired: Date | string;
  contactNumber?: string | null;
  currentAreaId?: number | null;
  profilePhotoKey?: string | null;
}

export function NurseFormDialog({
  open,
  onOpenChange,
  nurse,
  defaultStaffType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nurse?: NurseEditData;
  /** Staff type to pre-select when adding a new nurse (ignored when editing). */
  defaultStaffType?: (typeof STAFF_TYPES)[number];
}) {
  const utils = trpc.useUtils();
  const [employeeId, setEmployeeId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [position, setPosition] = useState("");
  const [staffType, setStaffType] = useState("Registered Nurse");
  const [employmentStatus, setEmploymentStatus] = useState("Active");
  const [dateHired, setDateHired] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [areaId, setAreaId] = useState("");
  const [photo, setPhoto] = useState<{ fileBase64: string; fileName: string; mimeType: string } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (nurse) {
        setEmployeeId(nurse.employeeId);
        setFirstName(nurse.firstName);
        setMiddleName(nurse.middleName ?? "");
        setLastName(nurse.lastName);
        setSuffix(nurse.suffix ?? "");
        setPosition(nurse.position ?? "");
        setStaffType(nurse.staffType ?? "Registered Nurse");
        setEmploymentStatus(nurse.employmentStatus ?? "Active");
        setDateHired(nurse.dateHired instanceof Date ? nurse.dateHired.toISOString().slice(0, 10) : String(nurse.dateHired).slice(0, 10));
        setContactNumber(nurse.contactNumber ?? "");
        setAreaId(nurse.currentAreaId ? String(nurse.currentAreaId) : "");
        setPhotoPreview(nurse.profilePhotoKey ? `/manus-storage/${nurse.profilePhotoKey}` : null);
      } else {
        setEmployeeId("");
        setFirstName("");
        setMiddleName("");
        setLastName("");
        setSuffix("");
        setPosition("");
        setStaffType(defaultStaffType ?? "Registered Nurse");
        setEmploymentStatus("Active");
        setDateHired("");
        setContactNumber("");
        setAreaId("");
        setPhoto(null);
        setPhotoPreview(null);
      }
    }
  }, [open, nurse, defaultStaffType]);

  const create = trpc.nurses.create.useMutation({
    onSuccess: () => {
      toast.success(`Added ${firstName.trim()} ${lastName.trim()}.`);
      utils.nurses.list.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.nurses.update.useMutation({
    onSuccess: () => {
      toast.success("Nurse updated.");
      utils.nurses.get.invalidate();
      utils.nurses.list.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const upload = trpc.nurses.uploadPhoto.useMutation({
    onSuccess: () => {
      utils.nurses.get.invalidate();
      utils.nurses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitting = create.isPending || update.isPending || upload.isPending;

  async function submit() {
    const data = {
      employeeId: employeeId.trim(),
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim(),
      suffix: suffix.trim() || undefined,
      position: position.trim() || undefined,
      staffType: staffType as (typeof STAFF_TYPES)[number],
      employmentStatus,
      dateHired: dateHired ? new Date(dateHired) : undefined,
      contactNumber: contactNumber.trim() || undefined,
    };
    let id = nurse?.id;
    if (nurse) {
      await update.mutateAsync({ id: nurse.id, ...data });
    } else {
      const created = await create.mutateAsync(data);
      id = created.id;
    }
    if (photo && id) {
      await upload.mutateAsync({ nurseId: id, ...photo });
    }
  }

  const valid = employeeId.trim() && firstName.trim() && lastName.trim() && dateHired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nurse ? "Edit Nurse" : "Add Nurse"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-3">
            <img
              src={photoPreview ?? ""}
              alt=""
              className={photoPreview ? "h-16 w-16 rounded-full border object-cover" : "h-16 w-16 rounded-full border border-dashed border-muted-foreground/40"}
            />
            <FileUploadButton
              kind="photo"
              label="Change Photo"
              onFile={(f) => {
                setPhoto(f);
                setPhotoPreview("data:" + f.mimeType + ";base64," + f.fileBase64);
              }}
            />
          </div>
          <div>
            <Label htmlFor="employeeId" className="mb-1 block">Employee ID *</Label>
            <Input id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g., N-2026-001" />
          </div>
          <div>
            <Label className="mb-1 block">Employment Status</Label>
            <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">First Name *</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Last Name *</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Middle Name</Label>
            <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Suffix</Label>
            <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="e.g., RN" />
          </div>
          <div>
            <Label className="mb-1 block">Position</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g., Staff Nurse" />
          </div>
          <div>
            <Label className="mb-1 block">Staff Type</Label>
            <Select value={staffType} onValueChange={setStaffType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAFF_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Contact Number</Label>
            <Input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Date Hired *</Label>
            <Input type="date" value={dateHired} onChange={(e) => setDateHired(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Current Area</Label>
            <AreaSelect value={areaId} onValueChange={setAreaId} placeholder="Unassigned" />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting || !valid}>
              {submitting ? "Saving…" : nurse ? "Save Changes" : "Add Nurse"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
