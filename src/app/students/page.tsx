"use client";

import { Eye, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type StudentRow = {
  usn: string;
  name: string;
  email: string;
  phone: string;
  academicYear: string;
  yearOfStudy: string;
};

export default function StudentsPage() {
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.student?.list) {
      setStudentRows([]);
      return;
    }

    api.student
      .list()
      .then((data: any[]) => {
        const normalized = (Array.isArray(data) ? data : []).map((row: any) => ({
          usn: String(row.usn ?? ""),
          name: String(row.name ?? ""),
          email: String(row.email ?? ""),
          phone: String(row.phone ?? ""),
          academicYear: String(row.academicYear ?? ""),
          yearOfStudy: String(row.yearOfStudy ?? ""),
        }));

        setStudentRows(normalized);
      })
      .catch(() => setStudentRows([]));
  }, []);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return studentRows;

    return studentRows.filter((row) =>
      [row.usn, row.name, row.email, row.phone, row.academicYear, row.yearOfStudy]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, studentRows]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black">Students</h1>
          <p className="text-sm text-[#444444]">Search, filter and inspect student records.</p>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-[10px] border border-[#E4E7EC] bg-white px-3.5 py-3 shadow-sm">
        <Search className="h-4 w-4 text-[#667085]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by USN, name, email or phone..."
          className="w-full border-none bg-transparent text-[15px] text-[#111111] placeholder:text-[#667085] focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#E5E5E5] bg-white shadow-[0_2px_8px_rgba(17,17,17,0.02)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F5F5F5] text-[#444444]">
            <tr>
              {['USN', 'Name', 'Email', 'Phone', 'Academic Year', 'Year of Study', 'Actions'].map((header) => (
                <th key={header} className="border-b border-[#E5E5E5] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((row) => (
                <tr key={row.usn} className="align-middle bg-white hover:bg-[#FAFAFA]">
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-[#111111]">{row.usn || "-"}</td>
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-[#111111]">{row.name || "-"}</td>
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-[#111111]">{row.email || "-"}</td>
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-[#111111]">{row.phone || "-"}</td>
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-[#111111]">{row.academicYear || "-"}</td>
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-[#111111]">{row.yearOfStudy || "-"}</td>
                  <td className="border-b border-[#E5E5E5] px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(row)}
                      className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-[12px] font-medium text-[#111111] hover:bg-[#f5f5f5]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#667085]">
                  {studentRows.length === 0 ? "No student data imported yet." : "No matching students found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-[14px] border border-[#E4E7EC] bg-white p-5 shadow-[0_12px_26px_rgba(17,17,17,0.1)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">Student Details</div>
                <div className="mt-1 text-[24px] font-bold text-[#111111]">{selectedStudent.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E4E7EC] bg-white text-[#111111] hover:bg-[#F5F5F5]"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <table className="w-full border-collapse text-left text-[14px]">
              <tbody>
                {[
                  { label: "USN", value: selectedStudent.usn },
                  { label: "Email", value: selectedStudent.email || "-" },
                  { label: "Phone", value: selectedStudent.phone || "-" },
                  { label: "Academic Year", value: selectedStudent.academicYear || "-" },
                  { label: "Year of Study", value: selectedStudent.yearOfStudy || "-" },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="border-b border-[#E4E7EC] px-3 py-2 text-[#667085]">{row.label}</td>
                    <td className="border-b border-[#E4E7EC] px-3 py-2 text-[#111111]">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
