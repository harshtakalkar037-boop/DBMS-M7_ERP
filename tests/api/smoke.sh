#!/usr/bin/env bash
# =============================================================================
#  API smoke test - exercises every REST endpoint of the University ERP.
#
#  Usage:  bash tests/api/smoke.sh [base-url]
#          BASE defaults to http://127.0.0.1:8080/api/v1
#
#  Prints one line per request:  <method> <path> <http-status>
#  and a summary at the end. Non-2xx responses are printed in full so a broken
#  endpoint is easy to spot.
# =============================================================================
set -uo pipefail

BASE="${1:-http://127.0.0.1:8080/api/v1}"
PASS=0; FAIL=0; FAILED_ROUTES=()

login() {
  curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
       -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))
except Exception: print('')"
}

# call <method> <path> <token> [json-body]
call() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local args=(-s -o /tmp/_body.json -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  local code; code=$(curl "${args[@]}")
  if [[ "$code" =~ ^2 ]]; then
    PASS=$((PASS+1)); printf '  %-6s %-58s %s\n' "$method" "$path" "$code"
  else
    FAIL=$((FAIL+1)); FAILED_ROUTES+=("$method $path -> $code")
    printf '  %-6s %-58s %s  <<< FAILED\n' "$method" "$path" "$code"
    head -c 400 /tmp/_body.json; echo
  fi
}

echo "== Authenticating =="
ADMIN=$(login admin@vpit.edu.in 'Admin@123')
FAC=$(login pallavi.gite@vpit.edu.in 'Faculty@123')
STU=$(login 2024ETC1001@vpit.edu.in 'Student@123')
ACC=$(login accountant@vpit.edu.in 'Account@123')
HOS=$(login hostel.admin@vpit.edu.in 'Hostel@123')
EXM=$(login examcell@vpit.edu.in 'Exam@123')
HR=$(login hr@vpit.edu.in 'Hr@123')
for n in ADMIN FAC STU ACC HOS EXM HR; do
  v="${!n}"; [ -z "$v" ] && echo "  !! no token for $n"
done

echo; echo "== health / meta =="
call GET /health
call GET /dashboard "$ADMIN"
call GET "/search?q=2024ETC" "$ADMIN"
call GET /settings "$ADMIN"

echo; echo "== students =="
call GET /students "$ADMIN"
call GET /students/stats "$ADMIN"
call GET /students/1 "$ADMIN"
call GET /students/1/addresses "$ADMIN"
call GET /students/1/guardians "$ADMIN"
call GET /students/1/documents "$ADMIN"
call GET /students/admissions "$ADMIN"
call GET /students/admissions/stats "$ADMIN"

echo; echo "== academics =="
call GET /academics/departments "$ADMIN"
call GET /academics/programs "$ADMIN"
call GET /academics/programs/all "$ADMIN"
call GET /academics/categories "$ADMIN"
call GET /academics/batches "$ADMIN"
call GET /academics/years "$ADMIN"
call GET /academics/semesters "$ADMIN"
call GET /academics/semesters/current "$ADMIN"
call GET /academics/sections "$ADMIN"
call GET /academics/subjects "$ADMIN"
call GET /academics/subjects/1 "$ADMIN"
call GET /academics/offerings "$ADMIN"
call GET /academics/offerings/1 "$ADMIN"
call GET /academics/enrollments "$ADMIN"
call GET /academics/faculty-subjects "$ADMIN"
call GET /academics/timetable/section/1 "$ADMIN"
call GET /academics/timetable/faculty/6 "$ADMIN"
call GET /academics/timetable/student/1 "$ADMIN"
call GET /academics/timetable/conflicts "$ADMIN"
call GET /academics/calendar "$ADMIN"

echo; echo "== attendance =="
call GET /attendance/sessions "$FAC"
call GET /attendance/sessions/1 "$FAC"
call GET /attendance/sessions/1/roster "$FAC"
call GET /attendance/report/offering/1 "$FAC"
call GET /attendance/report/low "$ADMIN"
call GET /attendance/report/stats "$ADMIN"
call GET /attendance/me "$STU"
call GET /attendance/me/overall "$STU"
call GET /attendance/me/monthly "$STU"
call GET /attendance/student/1 "$ADMIN"
call GET /attendance/student/1/overall "$ADMIN"
call GET /attendance/student/1/monthly "$ADMIN"
call GET /attendance/student/1/history "$ADMIN"

echo; echo "== exams =="
call GET /exams "$EXM"
call GET /exams/1 "$EXM"
call GET /exams/schedules "$EXM"
call GET /exams/registrations "$EXM"
call GET /exams/registrations/stats "$EXM"
call GET /exams/registrations/eligibility "$EXM"
call GET /exams/marks/sheet/1 "$EXM"
call GET /exams/results/department "$EXM"
call GET /exams/results/subjects "$EXM"
call GET /exams/results/rankings "$EXM"
call GET /exams/results/student/1 "$ADMIN"
call GET /exams/results/marksheet/1 "$ADMIN"
call GET /exams/results/summary/1 "$ADMIN"
call GET /exams/hall-ticket/me "$STU"
call GET /exams/results/me "$STU"
call GET /exams/grades "$EXM"
call GET /exams/policy/threshold "$EXM"

echo; echo "== fees =="
call GET /fees/structures "$ACC"
call GET /fees/structures/1 "$ACC"
call GET /fees/bills "$ACC"
call GET /fees/bills/stats "$ACC"
call GET /fees/bills/defaulters "$ACC"
call GET /fees/bills/1 "$ACC"
call GET /fees/bills/1/ledger "$ACC"
call GET /fees/bills/1/late-fee "$ACC"
call GET /fees/payments "$ACC"
call GET /fees/payments/daily "$ACC"
call GET /fees/payments/monthly "$ACC"
call GET /fees/fines "$ACC"
call GET /fees/scholarships "$ACC"
call GET /fees/refunds "$ACC"
call GET /fees/bills/me "$STU"
call GET /fees/bills/summary/me "$STU"
call GET /fees/scholarships/me "$STU"
call GET /fees/student/1/bills "$ADMIN"
call GET /fees/student/1/summary "$ADMIN"

echo; echo "== hostel =="
call GET /hostel/hostels "$HOS"
call GET /hostel/hostels/1 "$HOS"
call GET /hostel/occupancy "$HOS"
call GET /hostel/stats "$HOS"
call GET /hostel/rooms "$HOS"
call GET /hostel/rooms/vacancy "$HOS"
call GET /hostel/blocks "$HOS"
call GET /hostel/beds "$HOS"
call GET /hostel/applications "$HOS"
call GET /hostel/allocations "$HOS"
call GET /hostel/transfers "$HOS"
call GET /hostel/fees "$HOS"
call GET /hostel/allocations/me "$STU"
call GET /hostel/allocations/history/me "$STU"
call GET /hostel/applications/1/beds "$HOS"

echo; echo "== faculty / HR =="
call GET /faculty "$HR"
call GET /faculty/stats "$HR"
call GET /faculty/1 "$HR"
call GET /faculty/workload "$HR"
call GET /faculty/me "$FAC"
call GET /faculty/me/subjects "$FAC"
call GET /faculty/me/leave-balances "$FAC"
call GET /faculty/1/leave-balances "$HR"
call GET /faculty/leaves "$HR"
call GET /faculty/leaves/types "$HR"
call GET /faculty/leaves/1 "$HR"
call GET /faculty/payroll "$HR"
call GET /faculty/payroll/summary "$HR"
call GET /faculty/payroll/months "$HR"
call GET /faculty/payroll/1 "$HR"

echo; echo "== notifications =="
call GET /notifications "$ADMIN"
call GET /notifications/unread "$ADMIN"

echo; echo "== mock exams =="
call GET /mock-exams/bank/stats "$STU"
call GET /mock-exams/questions "$ADMIN"
call GET /mock-exams/questions/1 "$ADMIN"
call GET /mock-exams/questions/1/topics "$ADMIN"
call GET /mock-exams/attempts/me "$STU"
call GET /mock-exams/attempts/stats/me "$STU"
call GET /mock-exams/attempts/leaderboard "$STU"

echo; echo "== AI =="
call GET /ai/engine "$STU"
call GET /ai/study-plan "$STU"
call GET /ai/study-plan/me "$STU"
call GET /ai/history "$STU"
call GET /ai/sessions "$STU"
call GET /ai/at-risk "$ADMIN"
call POST /ai/chat "$STU" '{"message":"How is my attendance?","sessionId":"smoke-1"}'

echo; echo "== reports =="
call GET /reports "$ADMIN"
call GET /reports/kpis "$ADMIN"
for k in attendance_summary attendance_defaulters semester_result subject_failure \
         department_performance toppers backlog_students fee_collection fee_defaulters \
         daily_collection payment_register hostel_occupancy hostel_residents \
         faculty_workload payroll_register leave_register at_risk_students audit_trail; do
  call GET "/reports/$k" "$ADMIN"
done

echo; echo "== audit =="
call GET /audit "$ADMIN"
call GET /audit/stats "$ADMIN"
call GET /audit/actions "$ADMIN"
call GET /audit/entities "$ADMIN"

echo; echo "== RBAC negative checks (must be 403) =="
check403() {
  local method="$1" path="$2" token="$3"
  local code; code=$(curl -s -o /tmp/_b2 -w '%{http_code}' -X "$method" "$BASE$path" -H "Authorization: Bearer $token")
  if [ "$code" = "403" ]; then PASS=$((PASS+1)); printf '  %-6s %-58s %s (denied, as expected)\n' "$method" "$path" "$code";
  else FAIL=$((FAIL+1)); FAILED_ROUTES+=("$method $path expected 403 got $code"); printf '  %-6s %-58s %s  <<< RBAC LEAK\n' "$method" "$path" "$code"; fi
}
# A student CAN list students, but the service must scope the result to themselves.
scoped=$(curl -s "$BASE/students" -H "Authorization: Bearer $STU" \
  | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print(len(d.get('data',[])))
except Exception: print(-1)")
if [ "$scoped" = "1" ]; then PASS=$((PASS+1)); echo "  GET    /students (student sees only own record)                       200";
else FAIL=$((FAIL+1)); FAILED_ROUTES+=("/students student scope: $scoped rows"); echo "  GET    /students  <<< SCOPE LEAK ($scoped rows)"; fi
check403 GET /audit "$STU"
check403 GET /settings "$STU"
check403 GET /fees/bills/defaulters "$STU"
check403 GET /faculty "$STU"
check403 GET /reports/audit_trail "$STU"
check403 GET /ai/at-risk "$STU"

echo
echo "=================== API SMOKE SUMMARY ==================="
echo "passed : $PASS"
echo "failed : $FAIL"
if [ "$FAIL" -eq 0 ]; then echo "verdict: ALL API ENDPOINTS RESPONDED"; else
  echo "verdict: FAILURES PRESENT"; printf '  %s\n' "${FAILED_ROUTES[@]}"; fi
[ "$FAIL" -eq 0 ]
