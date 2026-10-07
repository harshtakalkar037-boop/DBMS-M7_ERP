import { query, queryOne, execute, Row } from '../config/database';
import { paginate, searchClause, ListResult } from './helpers';
import { Paging } from '../utils/api';

export const hostelsRepo = {
  list: () => query<Row>(
    `SELECT h.*, fn_hostel_available_beds(h.hostel_id) AS availableBeds,
            CONCAT(f.first_name, ' ', f.last_name) AS wardenName,
            (SELECT COUNT(*) FROM rooms r WHERE r.hostel_id = h.hostel_id) AS roomCount
     FROM hostels h LEFT JOIN faculty f ON f.faculty_id = h.warden_faculty_id
     ORDER BY h.hostel_code`),
  byId: (id: number) => queryOne<Row>('SELECT * FROM hostels WHERE hostel_id = ?', [id]),
  occupancy: () => query<Row>('SELECT * FROM v_hostel_occupancy'),
  stats: () => queryOne<Row>(
    `SELECT COUNT(*) AS hostels, SUM(total_beds) AS totalBeds, SUM(occupied_beds) AS occupiedBeds,
            (SELECT COUNT(*) FROM room_allocations ra WHERE ra.status = 'ACTIVE') AS residents,
            (SELECT COUNT(*) FROM hostel_applications ha WHERE ha.status = 'APPLIED') AS pendingApplications
     FROM hostels`),
};

export const roomsRepo = {
  list: (hostelId?: number, blockId?: number) => query<Row>(
    `SELECT r.*, b.name AS blockName, h.hostel_code AS hostelCode,
            (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.room_id) AS bedCount,
            (SELECT COUNT(*) FROM beds bd WHERE bd.room_id = r.room_id AND bd.status = 'AVAILABLE') AS freeBeds
     FROM rooms r
     LEFT JOIN hostel_blocks b ON b.block_id = r.block_id
     JOIN hostels h ON h.hostel_id = r.hostel_id
     ${hostelId ? 'WHERE r.hostel_id = ?' : ''}
     ORDER BY r.hostel_id, r.room_number`, hostelId ? [hostelId] : []),
  vacancy: () => query<Row>('SELECT * FROM v_room_vacancy ORDER BY hostel_code, room_number'),
  blocks: (hostelId?: number) => query<Row>(
    `SELECT b.*, h.hostel_code AS hostelCode,
            (SELECT COUNT(*) FROM rooms r WHERE r.block_id = b.block_id) AS rooms
     FROM hostel_blocks b JOIN hostels h ON h.hostel_id = b.hostel_id
     ${hostelId ? 'WHERE b.hostel_id = ?' : ''} ORDER BY b.block_code`,
    hostelId ? [hostelId] : []),
  beds: (roomId?: number, hostelId?: number) => query<Row>(
    `SELECT bd.*, r.room_number AS roomNumber, h.hostel_code AS hostelCode,
            (SELECT CONCAT(s.first_name, ' ', s.last_name) FROM room_allocations ra
              JOIN students s ON s.student_id = ra.student_id
             WHERE ra.bed_id = bd.bed_id AND ra.status = 'ACTIVE' LIMIT 1) AS occupantName
     FROM beds bd
     JOIN rooms r   ON r.room_id = bd.room_id
     JOIN hostels h ON h.hostel_id = r.hostel_id
     ${roomId ? 'WHERE bd.room_id = ?' : hostelId ? 'WHERE r.hostel_id = ?' : ''}
     ORDER BY bd.bed_code`,
    roomId ? [roomId] : hostelId ? [hostelId] : []),
  create: async (b: Record<string, any>): Promise<number> => {
    const res = await execute(
      `INSERT INTO rooms (hostel_id, block_id, room_number, floor, room_type, capacity, rent_per_bed, status)
       VALUES (?,?,?,?,?,?,?,'AVAILABLE')`,
      [b.hostelId, b.blockId ?? null, b.roomNumber, b.floor ?? 0,
       b.roomType ?? 'DOUBLE', b.capacity ?? 2, b.rentPerBed ?? 0],
    );
    const capacity = Number(b.capacity ?? 2);
    for (let i = 1; i <= capacity; i += 1) {
      await execute('INSERT INTO beds (room_id, bed_code, status) VALUES (?,?,"AVAILABLE")',
        [res.insertId, `${b.roomNumber}-${String.fromCharCode(64 + i)}`]);
    }
    return res.insertId;
  },
};

export const applicationsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.hostelId) { parts.push('ha.hostel_id = ?'); params.push(q.hostelId); }
    if (q.status) { parts.push('ha.status = ?'); params.push(q.status); }
    if (q.studentId) { parts.push('ha.student_id = ?'); params.push(q.studentId); }
    const where = searchClause(['ha.application_no', 'st.roll_number',
      'CONCAT(st.first_name, " ", st.last_name)'], q.search as string,
      { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params });
    return paginate<Row>({
      baseSql: `SELECT ha.*, st.roll_number AS rollNumber,
                       CONCAT(st.first_name, ' ', st.last_name) AS studentName, st.gender, st.phone,
                       h.hostel_code AS hostelCode, h.name AS hostelName, ay.year_label AS yearLabel,
                       p.program_code AS programCode
                FROM hostel_applications ha
                JOIN students st       ON st.student_id = ha.student_id
                JOIN hostels h         ON h.hostel_id = ha.hostel_id
                JOIN academic_years ay ON ay.academic_year_id = ha.academic_year_id
                JOIN programs p        ON p.program_id = st.program_id`,
      where, orderBy: 'ha.applied_on DESC', paging,
    });
  },
  create: async (b: Record<string, any>): Promise<number> => {
    // application_no is generated here (no DB sequence in MySQL); the UNIQUE key protects us.
    const no = `HAPP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const res = await execute(
      `INSERT INTO hostel_applications (application_no, student_id, hostel_id, academic_year_id,
                                        room_type_pref, status)
       VALUES (?,?,?,?,?,'APPLIED')`,
      [no, b.studentId, b.hostelId, b.academicYearId, b.roomTypePref ?? 'DOUBLE'],
    );
    return res.insertId;
  },
  review: (id: number, status: string, by: number, remarks?: string) =>
    execute(
      `UPDATE hostel_applications SET status = ?, reviewed_by = ?, reviewed_on = NOW(), remarks = ?
       WHERE application_id = ?`, [status, by, remarks ?? null, id]),
  /** Beds that can satisfy an application (same hostel, matching type, free). */
  suggestedBeds: (applicationId: number) => query<Row>(
    `SELECT bd.bed_id AS bedId, bd.bed_code AS bedCode, r.room_number AS roomNumber,
            r.room_type AS roomType, r.rent_per_bed AS rent, b.name AS blockName
     FROM hostel_applications ha
     JOIN beds bd    ON bd.status = 'AVAILABLE'
     JOIN rooms r    ON r.room_id = bd.room_id AND r.hostel_id = ha.hostel_id
     LEFT JOIN hostel_blocks b ON b.block_id = r.block_id
     WHERE ha.application_id = ? AND (ha.room_type_pref IS NULL OR r.room_type = ha.room_type_pref
           OR r.room_type <> 'SINGLE')
     ORDER BY r.room_number, bd.bed_code LIMIT 50`, [applicationId]),
};

export const allocationsRepo = {
  list: (q: Record<string, any>, paging: Paging): Promise<ListResult<Row>> => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (q.hostelId) { parts.push('ra.hostel_id = ?'); params.push(q.hostelId); }
    if (q.status) { parts.push('ra.status = ?'); params.push(q.status); }
    else { parts.push("ra.status = 'ACTIVE'"); }
    if (q.studentId) { parts.push('ra.student_id = ?'); params.push(q.studentId); }
    const where = searchClause(['st.roll_number', 'CONCAT(st.first_name, " ", st.last_name)'],
      q.search as string, { clause: `WHERE ${parts.join(' AND ')}`, params });
    return paginate<Row>({
      baseSql: `SELECT ra.*, st.roll_number AS rollNumber,
                       CONCAT(st.first_name, ' ', st.last_name) AS studentName, st.gender, st.phone,
                       h.hostel_code AS hostelCode, h.name AS hostelName,
                       r.room_number AS roomNumber, bd.bed_code AS bedCode,
                       ay.year_label AS yearLabel
                FROM room_allocations ra
                JOIN students st       ON st.student_id = ra.student_id
                JOIN hostels h         ON h.hostel_id = ra.hostel_id
                JOIN rooms r           ON r.room_id = ra.room_id
                JOIN beds bd           ON bd.bed_id = ra.bed_id
                JOIN academic_years ay ON ay.academic_year_id = ra.academic_year_id`,
      where, orderBy: 'ra.allocation_id DESC', paging,
    });
  },
  byId: (id: number) => queryOne<Row>(
    `SELECT ra.*, st.roll_number AS rollNumber,
            CONCAT(st.first_name, ' ', st.last_name) AS studentName,
            h.hostel_code AS hostelCode, r.room_number AS roomNumber, bd.bed_code AS bedCode
     FROM room_allocations ra
     JOIN students st ON st.student_id = ra.student_id
     JOIN hostels h   ON h.hostel_id = ra.hostel_id
     JOIN rooms r     ON r.room_id = ra.room_id
     JOIN beds bd     ON bd.bed_id = ra.bed_id
     WHERE ra.allocation_id = ?`, [id]),
  activeForStudent: (studentId: number) => queryOne<Row>(
    `SELECT ra.*, h.name AS hostelName, h.hostel_code AS hostelCode,
            r.room_number AS roomNumber, bd.bed_code AS bedCode, b.name AS blockName
     FROM room_allocations ra
     JOIN hostels h ON h.hostel_id = ra.hostel_id
     JOIN rooms r   ON r.room_id = ra.room_id
     JOIN beds bd   ON bd.bed_id = ra.bed_id
     LEFT JOIN hostel_blocks b ON b.block_id = r.block_id
     WHERE ra.student_id = ? AND ra.status = 'ACTIVE' LIMIT 1`, [studentId]),
  historyForStudent: (studentId: number) => query<Row>(
    `SELECT ra.*, h.hostel_code AS hostelCode, r.room_number AS roomNumber, bd.bed_code AS bedCode
     FROM room_allocations ra
     JOIN hostels h ON h.hostel_id = ra.hostel_id
     JOIN rooms r   ON r.room_id = ra.room_id
     JOIN beds bd   ON bd.bed_id = ra.bed_id
     WHERE ra.student_id = ? ORDER BY ra.allocation_id DESC`, [studentId]),
  transfers: (studentId?: number) => query<Row>(
    `SELECT t.*, CONCAT(s.first_name, ' ', s.last_name) AS studentName, s.roll_number AS rollNumber,
            r1.room_number AS fromRoom, bd1.bed_code AS fromBed,
            r2.room_number AS toRoom, bd2.bed_code AS toBed
     FROM room_transfers t
     JOIN students s        ON s.student_id = t.student_id
     JOIN beds bd1          ON bd1.bed_id = t.from_bed_id
     JOIN rooms r1          ON r1.room_id = bd1.room_id
     JOIN beds bd2          ON bd2.bed_id = t.to_bed_id
     JOIN rooms r2          ON r2.room_id = bd2.room_id
     ${studentId ? 'WHERE t.student_id = ?' : ''}
     ORDER BY t.transferred_on DESC`, studentId ? [studentId] : []),
};

export const hostelFeesRepo = {
  list: (q: Record<string, any>) => query<Row>(
    `SELECT hf.*, st.roll_number AS rollNumber, CONCAT(st.first_name, ' ', st.last_name) AS studentName,
            h.hostel_code AS hostelCode, r.room_number AS roomNumber, ay.year_label AS yearLabel
     FROM hostel_fees hf
     JOIN students st       ON st.student_id = hf.student_id
     JOIN room_allocations ra ON ra.allocation_id = hf.allocation_id
     JOIN hostels h         ON h.hostel_id = ra.hostel_id
     JOIN rooms r           ON r.room_id = ra.room_id
     JOIN academic_years ay ON ay.academic_year_id = hf.academic_year_id
     ${q.studentId ? 'WHERE hf.student_id = ?' : q.status ? 'WHERE hf.status = ?' : ''}
     ORDER BY hf.hostel_fee_id DESC LIMIT 200`,
    q.studentId ? [q.studentId] : q.status ? [q.status] : []),
};
