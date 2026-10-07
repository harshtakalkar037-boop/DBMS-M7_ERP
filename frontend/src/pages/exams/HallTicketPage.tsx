import { Ticket, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, PageHeader, StatusBadge, Loading, ErrorBox, EmptyState, useFetch } from '../../components/ui';
import { dateStr, num, titleCase } from '../../lib/format';

interface HallTicket {
  examId: number; examCode: string; examName: string; examType: string;
  startDate: string; endDate: string;
  studentId: number; rollNumber: string; studentName: string; programName: string;
  departmentName: string; semesterNo: number;
  subjects: {
    registrationId: number; hallTicketNo: string; subjectCode: string; subjectName: string;
    examDate: string; startTime: string; endTime: string; roomNumber: string;
    attendancePercentage: string; isEligible: boolean;
  }[];
}

export default function HallTicketPage() {
  const { data, loading, error, reload } = useFetch(() => api.get<HallTicket[]>('/exams/hall-ticket/me'), []);
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Hall ticket"
        subtitle="Issued only for registrations the database accepted — ineligible subjects never appear here."
        icon={<Ticket className="h-5 w-5" />}
        actions={<button type="button" className="btn-secondary btn-sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>}
      />

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !rows.length ? (
        <Card><EmptyState title="No hall tickets issued" hint="Register for an examination first — the exam cell issues hall tickets after registration closes." /></Card>
      ) : (
        <div className="space-y-4">
          {rows.map((t) => (
            <Card key={t.examId} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-dashed border-slate-300 bg-brand-50 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Vidya Pratishthan Institute of Technology</p>
                  <h2 className="text-lg font-semibold text-slate-900">{t.examName}</h2>
                  <p className="text-sm text-slate-600">{t.examCode} · {titleCase(t.examType)} · {dateStr(t.startDate)} to {dateStr(t.endDate)}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-slate-800">{t.studentName}</p>
                  <p className="text-slate-600">{t.rollNumber}</p>
                  <p className="text-xs text-slate-500">{t.programName}</p>
                  <p className="text-xs text-slate-500">{t.departmentName} · Semester {t.semesterNo}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Hall ticket no.</th><th>Subject</th><th>Date</th><th>Time</th>
                      <th>Hall</th><th className="text-right">Attendance</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.subjects.map((s) => (
                      <tr key={s.registrationId}>
                        <td className="font-medium text-slate-800">{s.hallTicketNo}</td>
                        <td>{s.subjectCode} · {s.subjectName}</td>
                        <td>{s.examDate ? dateStr(s.examDate) : '—'}</td>
                        <td>{s.startTime ? `${String(s.startTime).slice(0, 5)} – ${String(s.endTime).slice(0, 5)}` : '—'}</td>
                        <td>{s.roomNumber ?? '—'}</td>
                        <td className="text-right">{num(s.attendancePercentage, 1)}%</td>
                        <td><StatusBadge value={s.isEligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
                <span>Carry this ticket and your institute ID card to every examination.</span>
                <span>{num(t.subjects.length)} subject{t.subjects.length === 1 ? '' : 's'}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
