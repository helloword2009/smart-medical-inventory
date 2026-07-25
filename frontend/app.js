/* ============================================================================
 * SECURITY & DATA ISOLATION DEVELOPER NOTE (RBAC & MULTI-TENANCY)
 * ============================================================================
 * FRONTEND DATA ISOLATION:
 * The frontend state enforces strict scope isolation by filtering all data
 * pipelines (medicines, alerts, summary stats) using the active `hospital_id`.
 * 
 * BACKEND SECURITY REQUIREMENT (PRODUCTION RBAC):
 * While client-side filtering updates the view, production API endpoints (e.g.,
 * GET /api/medicines?hospital_id=HOSP-A) MUST NEVER rely solely on client parameters.
 * The backend Role-Based Access Control (RBAC) middleware MUST:
 * 1. Decode & verify the JWT or session token for the active user.
 * 2. Validate that `user.assigned_hospitals` or user scope permissions explicitly
 *    grant read authorization for the requested `hospital_id`.
 * 3. Reject unauthorized requests with 403 Forbidden before executing SQL queries,
 *    preventing Insecure Direct Object Reference (IDOR) & multi-hospital data leaks.
 * ============================================================================
 */

// API Configuration
const API_BASE = 'https://smart-medical-inventory.onrender.com/api';

// Realistic Multi-Hospital Datasets with deliberate stock discrepancies
const MOCK_HOSPITALS_DATA = {
    'HOSP-A': {
        id: 'HOSP-A',
        code: 'CGH',
        name: 'Central General Hospital',
        name_th: 'โรงพยาบาลศูนย์กลางทั่วไป',
        medicines: [
            { id: 1, hospital_id: 'HOSP-A', name: 'Paracetamol 500mg', batch_number: 'PR-2024-01', quantity: 150, price_per_unit: 1.50, expiry_date: '2026-05-10', storage_status: 'Room Temp' },
            { id: 2, hospital_id: 'HOSP-A', name: 'Amoxicillin 250mg', batch_number: 'AM-2024-05', quantity: 80, price_per_unit: 8.50, expiry_date: '2026-07-05', storage_status: 'Room Temp' },
            { id: 3, hospital_id: 'HOSP-A', name: 'Ibuprofen 400mg', batch_number: 'IB-2024-03', quantity: 60, price_per_unit: 5.00, expiry_date: '2026-08-15', storage_status: 'Room Temp' },
            { id: 4, hospital_id: 'HOSP-A', name: 'Insulin Glargine 100U/mL', batch_number: 'IN-2025-09', quantity: 25, price_per_unit: 350.00, expiry_date: '2026-11-20', storage_status: 'Refrigerator' },
            { id: 5, hospital_id: 'HOSP-A', name: 'Morphine Injection 10mg/mL', batch_number: 'MP-2025-02', quantity: 45, price_per_unit: 120.00, expiry_date: '2027-03-15', storage_status: 'Refrigerator' }, // Stocked in Hospital A
            { id: 6, hospital_id: 'HOSP-A', name: 'Epinephrine Injection 1mg/mL', batch_number: 'EP-2025-04', quantity: 30, price_per_unit: 95.00, expiry_date: '2026-12-10', storage_status: 'Refrigerator' }, // Stocked in Hospital A
            { id: 7, hospital_id: 'HOSP-A', name: 'Metformin 500mg', batch_number: 'MT-2024-11', quantity: 120, price_per_unit: 4.50, expiry_date: '2027-04-10', storage_status: 'Room Temp' },
            { id: 8, hospital_id: 'HOSP-A', name: 'Atorvastatin 20mg', batch_number: 'AT-2024-07', quantity: 8, price_per_unit: 12.00, expiry_date: '2026-07-30', storage_status: 'Room Temp' },
            { id: 9, hospital_id: 'HOSP-A', name: 'Vitamin C 500mg', batch_number: 'VC-2024-02', quantity: 5, price_per_unit: 3.00, expiry_date: '2026-06-01', storage_status: 'Room Temp' }
        ]
    },
    'HOSP-B': {
        id: 'HOSP-B',
        code: 'SJCH',
        name: 'St. Jude Community Hospital',
        name_th: 'โรงพยาบาลชุมชนเซนต์จูด',
        medicines: [
            { id: 10, hospital_id: 'HOSP-B', name: 'Paracetamol 500mg', batch_number: 'PR-2024-09', quantity: 90, price_per_unit: 1.50, expiry_date: '2026-09-12', storage_status: 'Room Temp' },
            { id: 11, hospital_id: 'HOSP-B', name: 'Amoxicillin 250mg', batch_number: 'AM-2024-12', quantity: 35, price_per_unit: 8.50, expiry_date: '2026-10-01', storage_status: 'Room Temp' },
            { id: 12, hospital_id: 'HOSP-B', name: 'Ibuprofen 400mg', batch_number: 'IB-2024-08', quantity: 40, price_per_unit: 5.00, expiry_date: '2027-01-20', storage_status: 'Room Temp' },
            { id: 13, hospital_id: 'HOSP-B', name: 'Insulin Glargine 100U/mL', batch_number: 'IN-2025-11', quantity: 6, price_per_unit: 350.00, expiry_date: '2026-08-25', storage_status: 'Refrigerator' },
            { id: 14, hospital_id: 'HOSP-B', name: 'Morphine Injection 10mg/mL', batch_number: 'MP-OUT-01', quantity: 0, price_per_unit: 120.00, expiry_date: '2026-01-01', storage_status: 'Refrigerator' }, // Strictly OUT OF STOCK (Qty: 0)
            { id: 15, hospital_id: 'HOSP-B', name: 'Epinephrine Injection 1mg/mL', batch_number: 'EP-OUT-01', quantity: 0, price_per_unit: 95.00, expiry_date: '2026-01-01', storage_status: 'Refrigerator' }, // Strictly OUT OF STOCK (Qty: 0)
            { id: 16, hospital_id: 'HOSP-B', name: 'Aspirin 81mg', batch_number: 'AS-2025-01', quantity: 110, price_per_unit: 2.00, expiry_date: '2027-08-01', storage_status: 'Room Temp' },
            { id: 17, hospital_id: 'HOSP-B', name: 'Salbutamol Inhaler 100mcg', batch_number: 'SB-2025-03', quantity: 15, price_per_unit: 180.00, expiry_date: '2026-12-05', storage_status: 'Room Temp' }
        ]
    }
};

// State Management for Active Hospital Scope
let currentHospitalId = localStorage.getItem('medikeep_active_hospital') || 'HOSP-A';

// Global Chart Instance Tracker
let usageTrendsChartInstance = null;

// Leaflet Map state
let leafletMap = null;
let vehicleMarker = null;
let routePolyline = null;
let bkkMarker = null;
let nswMarker = null;
let trackingInterval = null;

// Cached State Data (for fast re-rendering upon language toggle)
let lastMedicinesData = null;
let lastAlertsData = null;
let lastTrackingData = null;
let activeTabState = 'inventory'; // Default active view

// DOM Elements
const inventoryTableBody = document.getElementById('inventory-table-body');
const expiredAlertsContainer = document.getElementById('expired-alerts-container');
const warningAlertsContainer = document.getElementById('warning-alerts-container');
const searchInput = document.getElementById('search-input');

// Navigation Tab Elements
const tabDashboardBtn = document.getElementById('tab-dashboard-btn');
const tabInventoryBtn = document.getElementById('tab-inventory-btn');
const tabTrackingBtn = document.getElementById('tab-tracking-btn');
const dashboardView = document.getElementById('dashboard-view');
const inventoryView = document.getElementById('inventory-view');
const mapView = document.getElementById('map-view');
const currentViewLabel = document.getElementById('current-view-label');

// Language Switcher Buttons
const langThBtn = document.getElementById('lang-th-btn');
const langEnBtn = document.getElementById('lang-en-btn');

// Stat Counters Elements (Inventory View)
const statTotalItems = document.getElementById('stat-total-items');
const statExpired = document.getElementById('stat-expired');
const statNearExpiry = document.getElementById('stat-near-expiry');
const statLowStock = document.getElementById('stat-low-stock');

// Dashboard Summary Card Elements
const dashTotalItems = document.getElementById('dash-total-items');
const dashExpired = document.getElementById('dash-expired');
const dashNearExpiry = document.getElementById('dash-near-expiry');
const dashPreventedLoss = document.getElementById('dash-prevented-loss');

// Modal Elements
const addMedBtn = document.getElementById('add-med-btn');
const addMedModal = document.getElementById('add-med-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const addMedForm = document.getElementById('add-med-form');

// ============================================================
// INTERNATIONALIZATION (i18n) DICTIONARY & LOGIC
// ============================================================

const translations = {
    en: {
        nav_subtitle: "Smart Medical Inventory",
        nav_api_connected: "API Connected",
        tab_dashboard: "Dashboard Overview",
        tab_inventory: "Inventory Management",
        tab_tracking: "Tracking Map",
        active_view_prefix: "Active View:",
        
        // Hospital Switcher
        hospital_context_label: "Active Facility Scope",
        hospital_isolation_note: "Data isolation active • Isolated multi-location scope filter",
        hospital_switcher_label: "Switch Hospital:",
        hosp_a_option: "🏥 Central General Hospital (Hospital A)",
        hosp_b_option: "🏥 St. Jude Community Hospital (Hospital B)",
        hosp_variance_notice_title: "Stock Variance Discrepancy Notice",
        hosp_variance_notice_desc: "Morphine Injection and Epinephrine Injection are strictly OUT OF STOCK or unstocked at St. Jude Community Hospital (Hospital B), demonstrating multi-location supply chain variance.",

        // Dashboard
        dash_banner_title: "System Insights & Analytics",
        dash_banner_sub: "Real-time statistics to prevent medicine expirations, optimize storage, and monitor supply chains.",
        dash_banner_live: "Live Dashboard",
        card_total_header: "Total",
        dash_card1_desc: "Unique medicine types in inventory",
        card_expired_header: "Expired",
        dash_card2_desc: "Batches past expiry date — dispose immediately",
        card_near_header: "Near Expiry",
        dash_card3_desc: "Batches expiring within 90 days — prioritize usage",
        card_prevented_header: "Saved",
        dash_card4_desc: "Potential loss prevented via FEFO alerts",
        chart_title: "Medicine Usage Trends",
        chart_timeframe: "Last 6 Months",
        chart_dataset_label: "Consumed Volume",
        activity_title: "Recent Inventory Activities",
        activity_view_full: "View Full History",
        activity_sys_init: "System Initialization",
        activity_item1_title: "New Medicine Seeded",
        activity_item1_desc: "FastAPI backend completed initial database migration and table seed successfully.",
        activity_item2_title: "Expiry Alert Flagged",
        activity_item2_desc: "Paracetamol and Vitamin C batches identified as expired. Alerts generated dynamically.",
        activity_item3_title: "FEFO Logic Active",
        activity_item3_desc: "Medicines list retrieved in strict expiry date order from SQL backend database.",

        // Inventory
        stat_total_label: "Total Inventory Types",
        stat_total_sub: "Unique medicine models",
        stat_expired_label: "Critical Alerts (Expired)",
        stat_expired_sub: "Require immediate disposal",
        stat_near_label: "Near Expiry (< 90 Days)",
        stat_near_sub: "Prioritize for usage (FEFO)",
        stat_low_label: "Low Stock (< 10 Qty)",
        stat_low_sub: "Reorder soon",

        alerts_critical_title: "Critical Alerts: Expired",
        alerts_warning_title: "Warnings: Stock & Expiry",
        alerts_no_critical: "No active critical alerts.",
        alerts_no_warning: "No warnings currently active.",
        alert_expired_today: "Expired today",
        alert_expired_days: "Expired {days} days ago",
        alert_expired_1day: "Expired 1 day ago",
        alert_expires_in: "Expires in {days} days",
        alert_low_stock: "Low Stock: {qty} remaining",
        alert_batch_label: "Batch",
        alert_qty_label: "Qty",

        search_placeholder: "Search medicine by name...",
        btn_add_medicine: "Add Medicine",
        table_section_title: "Live Inventory",
        table_section_sub: "Sorted by FEFO (First-Expired, First-Out) logic",
        legend_label: "Legend:",
        legend_expired: "Expired",
        legend_near_low: "Near Expiry / Low",
        legend_normal: "Normal",

        th_med_name: "Medicine Name",
        th_batch: "Batch Number",
        th_quantity: "Quantity",
        th_unit_price: "Unit Price",
        th_expiry_date: "Expiry Date",
        th_storage: "Storage Location",
        th_status: "Status",

        table_loading: "Loading medical inventory...",
        table_no_records: "No medicine inventory records found.",
        table_error: "Failed to fetch inventory data. Please verify the backend API server is running on port 8000.",

        status_expired: "Expired",
        status_attention: "Attention Needed",
        status_stable: "Stable",
        status_out_of_stock: "Out of Stock",

        storage_room_temp: "Room Temp",
        storage_refrigerator: "Refrigerator",
        storage_freezer: "Freezer",

        days_ago: "Expired {days}d ago",
        days_left: "{days} days left",

        // Tracking Map
        track_banner_title: "Live Cold Chain Transit Status",
        track_banner_sub: "Real-time GPS tracking and IoT telemetry for active medicine shipments.",
        track_banner_badge: "Active Simulation",
        track_status_header: "Shipment Status",
        track_route_info: "Route: Bangkok to Nakhon Sawan",
        track_progress_label: "Progress",
        track_temp_header: "Temp",
        track_temp_badge: "Safe Range",
        track_humidity_header: "Humidity",
        track_humidity_badge: "Optimal",
        track_coords_header: "Coordinates",
        track_lat_label: "Latitude:",
        track_lng_label: "Longitude:",

        iot_status_in_transit: "In Transit",
        iot_status_delivered: "Delivered",
        iot_status_pending: "Pending",

        map_bkk_title: "Bangkok Central Warehouse",
        map_bkk_desc: "Origin point.",
        map_nsw_title: "Nakhon Sawan Facility",
        map_nsw_desc: "Destination facility.",
        map_vehicle_title: "Medical Transport Vehicle (Cold Chain)",
        map_vehicle_popup_title: "Cold Chain Vehicle",

        // Modal
        modal_title: "Add New Medicine",
        modal_label_name: "Medicine Name",
        modal_ph_name: "e.g. Paracetamol",
        modal_label_batch: "Batch Number",
        modal_ph_batch: "e.g. BA-991",
        modal_label_qty: "Quantity",
        modal_ph_qty: "e.g. 50",
        modal_label_expiry: "Expiry Date",
        modal_label_storage: "Storage Status",
        opt_room_temp: "Room Temp",
        opt_refrigerator: "Refrigerator",
        opt_freezer: "Freezer",
        modal_label_price: "Price per Unit (฿)",
        modal_ph_price: "e.g. 12.50",
        btn_cancel: "Cancel",
        btn_save_medicine: "Save Medicine",

        // Footer
        footer_text: "MediKeep Prototype - High School Science & Engineering Fair 2026"
    },
    th: {
        nav_subtitle: "ระบบคลังเวชภัณฑ์อัจฉริยะ",
        nav_api_connected: "เชื่อมต่อ API แล้ว",
        tab_dashboard: "ภาพรวมแดชบอร์ด",
        tab_inventory: "การจัดการคลังเวชภัณฑ์",
        tab_tracking: "แผนที่ติดตามพัสดุ",
        active_view_prefix: "มุมมองปัจจุบัน:",

        // Hospital Switcher
        hospital_context_label: "ขอบเขตสถานพยาบาลที่ใช้งาน",
        hospital_isolation_note: "แยกข้อมูลตามโรงพยาบาล • การกรองขอบเขตหลายพื้นที่อย่างปลอดภัย",
        hospital_switcher_label: "สลับโรงพยาบาล:",
        hosp_a_option: "🏥 โรงพยาบาลศูนย์กลางทั่วไป (Hospital A)",
        hosp_b_option: "🏥 โรงพยาบาลชุมชนเซนต์จูด (Hospital B)",
        hosp_variance_notice_title: "การแจ้งเตือนความแตกต่างของสต็อกตามสถานที่",
        hosp_variance_notice_desc: "Morphine Injection และ Epinephrine Injection ไม่มีในสต็อกหรือไม่มีรายการจัดเก็บที่โรงพยาบาลชุมชนเซนต์จูด (Hospital B) เพื่อแสดงความแตกต่างของสต็อกตามสถานที่",

        // Dashboard
        dash_banner_title: "ข้อมูลเชิงลึกและสถิติระบบ",
        dash_banner_sub: "สถิติแบบเรียลไทม์เพื่อป้องกันยาหมดอายุ จัดการพื้นที่จัดเก็บ และติดตามห่วงโซ่อุปทาน",
        dash_banner_live: "แดชบอร์ดเรียลไทม์",
        card_total_header: "ทั้งหมด",
        dash_card1_desc: "จำนวนชนิดยาในคลัง",
        card_expired_header: "หมดอายุ",
        dash_card2_desc: "รุ่นยาที่หมดอายุ — ดำเนินการทำลายทันที",
        card_near_header: "ใกล้หมดอายุ",
        dash_card3_desc: "รุ่นยาที่จะหมดอายุภายใน 90 วัน — ควรจัดสรรใช้งานก่อน",
        card_prevented_header: "มูลค่าที่ป้องกันได้",
        dash_card4_desc: "มูลค่าความเสียหายที่ป้องกันได้ด้วยแจ้งเตือน FEFO",
        chart_title: "แนวโน้มการใช้งานยา",
        chart_timeframe: "6 เดือนที่ผ่านมา",
        chart_dataset_label: "ปริมาณการใช้งาน",
        activity_title: "กิจกรรมคลังยาล่าสุด",
        activity_view_full: "ดูประวัติทั้งหมด",
        activity_sys_init: "เริ่มทำงานระบบ",
        activity_item1_title: "เพิ่มข้อมูลยาเริ่มต้น",
        activity_item1_desc: "แบ็กเอนด์ FastAPI ทำการย้ายฐานข้อมูลและเริ่มต้นข้อมูลสำเร็จ",
        activity_item2_title: "แจ้งเตือนยาหมดอายุ",
        activity_item2_desc: "ตรวจพบรุ่นยา Paracetamol และ Vitamin C หมดอายุ ระบบสร้างการแจ้งเตือนอัตโนมัติ",
        activity_item3_title: "ระบบ FEFO ทำงาน",
        activity_item3_desc: "ดึงรายการยาตามลำดับวันหมดอายุ (FEFO) จากฐานข้อมูล SQL",

        // Inventory
        stat_total_label: "จำนวนชนิดยาในคลัง",
        stat_total_sub: "ชนิดยาที่แตกต่างกัน",
        stat_expired_label: "การแจ้งเตือนวิกฤต (หมดอายุ)",
        stat_expired_sub: "ต้องทำการทำลายทันที",
        stat_near_label: "ใกล้หมดอายุ (< 90 วัน)",
        stat_near_sub: "ควรจัดลำดับการใช้ก่อน (FEFO)",
        stat_low_label: "ยาเหลือน้อย (< 10 ชิ้น)",
        stat_low_sub: "ควรสั่งซื้อเพิ่มเร็วๆ นี้",

        alerts_critical_title: "การแจ้งเตือนวิกฤต: ยาหมดอายุ",
        alerts_warning_title: "คำเตือน: สต็อกและวันหมดอายุ",
        alerts_no_critical: "ไม่มีการแจ้งเตือนวิกฤต",
        alerts_no_warning: "ไม่มีคำเตือนในขณะนี้",
        alert_expired_today: "หมดอายุวันนี้",
        alert_expired_days: "หมดอายุ {days} วันที่แล้ว",
        alert_expired_1day: "หมดอายุ 1 วันที่แล้ว",
        alert_expires_in: "จะหมดอายุใน {days} วัน",
        alert_low_stock: "ยาเหลือน้อย: คงเหลือ {qty}",
        alert_batch_label: "รุ่น",
        alert_qty_label: "จำนวน",

        search_placeholder: "ค้นหายาตามชื่อ...",
        btn_add_medicine: "เพิ่มรายการยา",
        table_section_title: "รายการคลังยาปัจจุบัน",
        table_section_sub: "เรียงลำดับตามหลัก FEFO (หมดอายุก่อน ออกก่อน)",
        legend_label: "สัญลักษณ์:",
        legend_expired: "หมดอายุ",
        legend_near_low: "ใกล้หมดอายุ / เหลือน้อย",
        legend_normal: "ปกติ",

        th_med_name: "ชื่อยา",
        th_batch: "หมายเลขรุ่น",
        th_quantity: "จำนวน",
        th_unit_price: "ราคาต่อหน่วย",
        th_expiry_date: "วันหมดอายุ",
        th_storage: "สถานที่จัดเก็บ",
        th_status: "สถานะ",

        table_loading: "กำลังโหลดข้อมูลคลังยา...",
        table_no_records: "ไม่พบบันทึกข้อมูลยาในคลัง",
        table_error: "ไม่สามารถดึงข้อมูลคลังยาได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์ API ทำงานอยู่",

        status_expired: "หมดอายุ",
        status_attention: "ต้องให้ความสนใจ",
        status_stable: "ปกติ",
        status_out_of_stock: "หมดสต็อก",

        storage_room_temp: "อุณหภูมิห้อง",
        storage_refrigerator: "ตู้เย็น",
        storage_freezer: "ตู้แช่แข็ง",

        days_ago: "หมดอายุ {days} วันที่แล้ว",
        days_left: "เหลืออีก {days} วัน",

        // Tracking Map
        track_banner_title: "สถานะการขนส่งสายความเย็นเรียลไทม์",
        track_banner_sub: "การติดตาม GPS เรียลไทม์และข้อมูล IoT สำหรับการขนส่งยา",
        track_banner_badge: "จำลองสถานการณ์การทำงาน",
        track_status_header: "สถานะการขนส่ง",
        track_route_info: "เส้นทาง: กรุงเทพฯ ไป นครสวรรค์",
        track_progress_label: "ความคืบหน้า",
        track_temp_header: "อุณหภูมิ",
        track_temp_badge: "อยู่ในช่วงปลอดภัย",
        track_humidity_header: "ความชื้น",
        track_humidity_badge: "เหมาะสม",
        track_coords_header: "พิกัด GPS",
        track_lat_label: "ละติจูด:",
        track_lng_label: "ลองจิจูด:",

        iot_status_in_transit: "กำลังขนส่ง",
        iot_status_delivered: "จัดส่งสำเร็จ",
        iot_status_pending: "รอดำเนินการ",

        map_bkk_title: "คลังสินค้ากลาง กรุงเทพฯ",
        map_bkk_desc: "จุดเริ่มต้น",
        map_nsw_title: "ศูนย์กระจายสินค้า นครสวรรค์",
        map_nsw_desc: "จุดหมายปลายทาง",
        map_vehicle_title: "ยานพาหนะขนส่งยา (ควบคุมอุณหภูมิ)",
        map_vehicle_popup_title: "รถขนส่งควบคุมอุณหภูมิ",

        // Modal
        modal_title: "เพิ่มรายการยาใหม่",
        modal_label_name: "ชื่อยา",
        modal_ph_name: "เช่น Paracetamol",
        modal_label_batch: "หมายเลขรุ่น",
        modal_ph_batch: "เช่น BA-991",
        modal_label_qty: "จำนวน",
        modal_ph_qty: "เช่น 50",
        modal_label_expiry: "วันหมดอายุ",
        modal_label_storage: "สถานะการจัดเก็บ",
        opt_room_temp: "อุณหภูมิห้อง",
        opt_refrigerator: "ตู้เย็น",
        opt_freezer: "ตู้แช่แข็ง",
        modal_label_price: "ราคาต่อหน่วย (฿)",
        modal_ph_price: "เช่น 12.50",
        btn_cancel: "ยกเลิก",
        btn_save_medicine: "บันทึกรายการยา",

        // Footer
        footer_text: "MediKeep Prototype - งานประกวดโครงงานวิทยาศาสตร์และวิศวกรรมศาสตร์ 2026"
    }
};

// Language State (Preserved via localStorage)
let currentLang = (localStorage.getItem('medikeep_lang') || 'TH').toUpperCase();

// Translation Helper Function
function t(key, params = {}) {
    const langKey = currentLang.toLowerCase();
    let text = translations[langKey]?.[key] || translations['en']?.[key] || key;
    for (const [pKey, pVal] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${pKey}\\}`, 'g'), pVal);
    }
    return text;
}

// Switch Language and Update UI Dynamically
function setLanguage(lang) {
    currentLang = lang.toUpperCase();
    localStorage.setItem('medikeep_lang', currentLang);

    // Update Language Toggle Buttons Style
    const activeClass = 'px-2.5 py-1 rounded-lg transition duration-200 bg-sky-500 text-white font-bold shadow-sm';
    const inactiveClass = 'px-2.5 py-1 rounded-lg transition duration-200 text-slate-500 hover:text-slate-800 font-semibold';

    if (langThBtn && langEnBtn) {
        if (currentLang === 'TH') {
            langThBtn.className = activeClass;
            langEnBtn.className = inactiveClass;
        } else {
            langEnBtn.className = activeClass;
            langThBtn.className = inactiveClass;
        }
    }

    // Translate DOM text elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });

    // Translate input placeholders with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.placeholder = t(key);
        }
    });

    // Update active tab view label text
    updateActiveViewLabel();

    // Refresh Hospital context header label
    setHospital(currentHospitalId);

    // Re-render dynamic components from cache if loaded
    if (lastMedicinesData) {
        renderMedicinesTable(lastMedicinesData);
    }
    if (lastAlertsData) {
        renderAlerts(lastAlertsData);
    }
    if (lastTrackingData) {
        updateTrackingUI(lastTrackingData);
    }

    // Re-render chart dataset label
    if (usageTrendsChartInstance) {
        fetchAndRenderChart();
    }
}

// Update Active View Label text dynamically based on language
function updateActiveViewLabel() {
    if (!currentViewLabel) return;
    if (activeTabState === 'dashboard') {
        currentViewLabel.textContent = t('tab_dashboard');
    } else if (activeTabState === 'inventory') {
        currentViewLabel.textContent = t('tab_inventory');
    } else if (activeTabState === 'tracking') {
        currentViewLabel.textContent = t('tab_tracking');
    }
}

// Attach Language Switcher Click Event Listeners
if (langThBtn && langEnBtn) {
    langThBtn.addEventListener('click', () => setLanguage('TH'));
    langEnBtn.addEventListener('click', () => setLanguage('EN'));
}

// ============================================================
// HOSPITAL SWITCHER & DATA ISOLATION LOGIC
// ============================================================

function setHospital(hospitalId) {
    if (!MOCK_HOSPITALS_DATA[hospitalId]) return;
    currentHospitalId = hospitalId;
    localStorage.setItem('medikeep_active_hospital', currentHospitalId);

    const hospSelect = document.getElementById('hospital-select');
    if (hospSelect && hospSelect.value !== currentHospitalId) {
        hospSelect.value = currentHospitalId;
    }

    const activeHospNameEl = document.getElementById('active-hospital-name');
    const hospBadgeEl = document.getElementById('hospital-badge');
    const discBannerEl = document.getElementById('hospital-discrepancy-banner');

    const hospInfo = MOCK_HOSPITALS_DATA[currentHospitalId];

    if (activeHospNameEl) {
        activeHospNameEl.textContent = currentLang === 'TH' ? hospInfo.name_th : hospInfo.name;
    }
    if (hospBadgeEl) {
        hospBadgeEl.textContent = hospInfo.code;
    }

    if (discBannerEl) {
        if (currentHospitalId === 'HOSP-B') {
            discBannerEl.classList.remove('hidden');
        } else {
            discBannerEl.classList.add('hidden');
        }
    }

    const currentSearch = searchInput ? searchInput.value.trim() : '';
    fetchMedicines(currentSearch);
    fetchAlerts();
    fetchDashboardSummary();

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// UTILITY HELPERS
// ============================================================

// Currency formatter – formats a number into Thai Baht (฿)
function formatBaht(value) {
    const num = Number(value) || 0;
    return '฿' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Date validation helper (force YYYY-MM-DD string parsing correctly across timezones)
function parseLocalDate(dateString) {
    if (!dateString || dateString === 'N/A') return new Date();
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Calculate remaining days until expiry relative to today
function getDaysToExpiry(expiryDateStr) {
    if (!expiryDateStr || expiryDateStr === 'N/A') return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = parseLocalDate(expiryDateStr);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Storage Status Translation Helper
function getStorageStatusText(status) {
    if (status === 'Room Temp') return t('storage_room_temp');
    if (status === 'Refrigerator') return t('storage_refrigerator');
    if (status === 'Freezer') return t('storage_freezer');
    return status;
}

// IoT Status Translation Helper
function getIotStatusText(status) {
    if (status === 'In Transit') return t('iot_status_in_transit');
    if (status === 'Delivered') return t('iot_status_delivered');
    if (status === 'Pending') return t('iot_status_pending');
    return status;
}

// ============================================================
// MODAL LOGIC
// ============================================================

function openModal() {
    addMedModal.classList.remove('opacity-0', 'pointer-events-none');
    addMedModal.querySelector('div').classList.remove('scale-95');
    addMedModal.querySelector('div').classList.add('scale-100');
    // Set default date input value to today for ease of use
    document.getElementById('med-expiry').value = new Date().toISOString().split('T')[0];
}

function closeModal() {
    addMedModal.classList.add('opacity-0', 'pointer-events-none');
    addMedModal.querySelector('div').classList.remove('scale-100');
    addMedModal.querySelector('div').classList.add('scale-95');
    addMedForm.reset();
}

if (addMedBtn) addMedBtn.addEventListener('click', openModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

if (addMedModal) {
    addMedModal.addEventListener('click', (e) => {
        if (e.target === addMedModal) {
            closeModal();
        }
    });
}

// ============================================================
// DASHBOARD SUMMARY
// ============================================================

async function fetchDashboardSummary() {
    try {
        let summaryData = null;

        try {
            const response = await fetch(`${API_BASE}/dashboard-summary?hospital_id=${encodeURIComponent(currentHospitalId)}`);
            if (response.ok) {
                summaryData = await response.json();
            }
        } catch (apiErr) {
            // Silently fall back to mock scoped calculation
        }

        if (!summaryData) {
            const hospitalScope = MOCK_HOSPITALS_DATA[currentHospitalId] || MOCK_HOSPITALS_DATA['HOSP-A'];
            const scopedMeds = hospitalScope.medicines ? hospitalScope.medicines : [];
            
            let criticalCount = 0;
            let nearExpiryCount = 0;
            let preventedLoss = 0;

            scopedMeds.forEach(m => {
                const days = getDaysToExpiry(m.expiry_date);
                if (days < 0 || m.quantity === 0) {
                    criticalCount++;
                } else if (days <= 90) {
                    nearExpiryCount++;
                    preventedLoss += (m.quantity * (m.price_per_unit || 0));
                }
            });

            summaryData = {
                total_items: scopedMeds.length,
                critical_alerts: criticalCount,
                near_expiry: nearExpiryCount,
                prevented_loss_value: preventedLoss
            };
        }

        if (dashTotalItems) dashTotalItems.textContent = summaryData.total_items;
        if (dashExpired) dashExpired.textContent = summaryData.critical_alerts;
        if (dashNearExpiry) dashNearExpiry.textContent = summaryData.near_expiry;
        if (dashPreventedLoss) dashPreventedLoss.textContent = formatBaht(summaryData.prevented_loss_value);
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        if (dashTotalItems) dashTotalItems.textContent = '—';
        if (dashExpired) dashExpired.textContent = '—';
        if (dashNearExpiry) dashNearExpiry.textContent = '—';
        if (dashPreventedLoss) dashPreventedLoss.textContent = '—';
    }
}

// ============================================================
// ALERTS
// ============================================================

async function fetchAlerts() {
    try {
        let alertsData = null;

        try {
            const response = await fetch(`${API_BASE}/alerts?hospital_id=${encodeURIComponent(currentHospitalId)}`);
            if (response.ok) {
                const apiData = await response.json();
                if (apiData && (apiData.expired || apiData.near_expiry || apiData.low_stock)) {
                    alertsData = apiData;
                }
            }
        } catch (apiErr) {
            // Silently fall back to mock scoped calculation
        }

        if (!alertsData) {
            const hospitalScope = MOCK_HOSPITALS_DATA[currentHospitalId] || MOCK_HOSPITALS_DATA['HOSP-A'];
            const scopedMeds = hospitalScope.medicines ? hospitalScope.medicines : [];
            
            const expired = [];
            const near_expiry = [];
            const low_stock = [];

            scopedMeds.forEach(med => {
                const days = getDaysToExpiry(med.expiry_date);
                if (days < 0 || med.quantity === 0) {
                    expired.push(med);
                } else if (days <= 90) {
                    near_expiry.push(med);
                }

                if (med.quantity < 10 && days >= 0 && med.quantity > 0) {
                    low_stock.push(med);
                }
            });

            alertsData = { expired, near_expiry, low_stock };
        }

        // Data Isolation enforcement on alert lists
        alertsData.expired = (alertsData.expired || []).filter(m => !m.hospital_id || m.hospital_id === currentHospitalId);
        alertsData.near_expiry = (alertsData.near_expiry || []).filter(m => !m.hospital_id || m.hospital_id === currentHospitalId);
        alertsData.low_stock = (alertsData.low_stock || []).filter(m => !m.hospital_id || m.hospital_id === currentHospitalId);

        lastAlertsData = alertsData;
        renderAlerts(alertsData);

        // Update stats counters
        if (statExpired) statExpired.textContent = alertsData.expired.length;
        if (statNearExpiry) statNearExpiry.textContent = alertsData.near_expiry.length;
        if (statLowStock) statLowStock.textContent = alertsData.low_stock.length;
    } catch (error) {
        console.error('Error fetching alerts:', error);
    }
}

// Render alerts inside the notifications panel
function renderAlerts(alerts) {
    // 1. Expired & Out of Stock alerts
    expiredAlertsContainer.innerHTML = '';
    if (!alerts || alerts.expired.length === 0) {
        expiredAlertsContainer.innerHTML = `<div class="text-slate-400 text-sm text-center py-6">${t('alerts_no_critical')}</div>`;
    } else {
        alerts.expired.forEach(med => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-3.5 bg-red-50 border border-red-100 rounded-xl transition duration-200 hover:bg-red-100/50 shadow-sm';

            const daysAgo = Math.abs(getDaysToExpiry(med.expiry_date));
            const daysLabel = med.quantity === 0
                ? t('status_out_of_stock')
                : (daysAgo === 0 
                    ? t('alert_expired_today') 
                    : (daysAgo === 1 ? t('alert_expired_1day') : t('alert_expired_days', { days: daysAgo })));

            // NOTE: med.name (Drug Title) MUST NOT be translated or modified
            card.innerHTML = `
                <div>
                    <h3 class="font-semibold text-red-900 text-sm">${med.name}</h3>
                    <p class="text-xs text-red-700/80">${t('alert_batch_label')}: ${med.batch_number} • ${t('alert_qty_label')}: ${med.quantity}</p>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-red-100 border border-red-200 text-red-700">
                        ${daysLabel}
                    </span>
                    <p class="text-[10px] text-red-600/70 mt-1">${med.expiry_date}</p>
                </div>
            `;
            expiredAlertsContainer.appendChild(card);
        });
    }

    // 2. Warnings (Low stock + Near expiry)
    warningAlertsContainer.innerHTML = '';
    const warnings = [];

    if (alerts) {
        alerts.near_expiry.forEach(med => {
            const days = getDaysToExpiry(med.expiry_date);
            warnings.push({
                type: 'expiry',
                med: med,
                days: days,
                label: t('alert_expires_in', { days: days })
            });
        });

        alerts.low_stock.forEach(med => {
            const exists = warnings.find(w => w.med.id === med.id);
            if (!exists) {
                warnings.push({
                    type: 'stock',
                    med: med,
                    label: t('alert_low_stock', { qty: med.quantity })
                });
            }
        });
    }

    if (warnings.length === 0) {
        warningAlertsContainer.innerHTML = `<div class="text-slate-400 text-sm text-center py-6">${t('alerts_no_warning')}</div>`;
    } else {
        warnings.forEach(warn => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-3.5 bg-amber-50 border border-amber-100 rounded-xl transition duration-200 hover:bg-amber-100/50 shadow-sm';

            const badgeColor = warn.type === 'expiry' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-orange-100 text-orange-850 border-orange-200';

            // NOTE: warn.med.name (Drug Title) MUST NOT be translated or modified
            card.innerHTML = `
                <div>
                    <h3 class="font-semibold text-amber-900 text-sm">${warn.med.name}</h3>
                    <p class="text-xs text-amber-700/80">${t('alert_batch_label')}: ${warn.med.batch_number} • ${t('alert_qty_label')}: ${warn.med.quantity}</p>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${badgeColor} border">
                        ${warn.label}
                    </span>
                    <p class="text-[10px] text-amber-600/70 mt-1">${warn.med.expiry_date}</p>
                </div>
            `;
            warningAlertsContainer.appendChild(card);
        });
    }
}

// ============================================================
// MEDICINES TABLE
// ============================================================

async function fetchMedicines(searchQuery = '') {
    try {
        let medicines = [];
        let fetchedFromApi = false;

        try {
            let url = `${API_BASE}/medicines?hospital_id=${encodeURIComponent(currentHospitalId)}`;
            if (searchQuery) {
                url += `&search=${encodeURIComponent(searchQuery)}`;
            }

            const response = await fetch(url);
            if (response.ok) {
                const apiData = await response.json();
                if (Array.isArray(apiData) && apiData.length > 0) {
                    medicines = apiData;
                    fetchedFromApi = true;
                }
            }
        } catch (apiErr) {
            // API unavailable or unseeded for hospital_id, fallback to local dataset
        }

        if (!fetchedFromApi) {
            const hospitalScope = MOCK_HOSPITALS_DATA[currentHospitalId] || MOCK_HOSPITALS_DATA['HOSP-A'];
            medicines = hospitalScope.medicines ? [...hospitalScope.medicines] : [];
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                medicines = medicines.filter(med => 
                    med.name.toLowerCase().includes(query) || 
                    med.batch_number.toLowerCase().includes(query)
                );
            }
        }

        // Enforce strict client-side data isolation check (defense-in-depth)
        medicines = medicines.filter(med => !med.hospital_id || med.hospital_id === currentHospitalId);

        // FEFO Sorting: First Expired, First Out
        medicines.sort((a, b) => {
            const dateA = parseLocalDate(a.expiry_date);
            const dateB = parseLocalDate(b.expiry_date);
            return dateA - dateB;
        });

        lastMedicinesData = medicines;
        renderMedicinesTable(medicines);

        if (statTotalItems) {
            statTotalItems.textContent = medicines.length;
        }
    } catch (error) {
        console.error('Error fetching medicines:', error);
        inventoryTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-rose-600">
                    ${t('table_error')}
                </td>
            </tr>
        `;
    }
}

// Render medicines table rows
function renderMedicinesTable(medicines) {
    inventoryTableBody.innerHTML = '';

    if (!medicines || medicines.length === 0) {
        inventoryTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                    ${t('table_no_records')}
                </td>
            </tr>
        `;
        return;
    }

    medicines.forEach(med => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 border-b border-slate-100 transition duration-150';

        const days = getDaysToExpiry(med.expiry_date);
        let statusBadge = '';
        let rowIndicator = '';

        if (med.quantity === 0) {
            // Out of Stock
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700">${t('status_out_of_stock')}</span>`;
            rowIndicator = 'border-l-4 border-rose-500';
        } else if (days < 0) {
            // Expired
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700">${t('status_expired')}</span>`;
            rowIndicator = 'border-l-4 border-red-500';
        } else if (days <= 90 || med.quantity < 10) {
            // Low stock or Near Expiry
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">${t('status_attention')}</span>`;
            rowIndicator = 'border-l-4 border-amber-500';
        } else {
            // Stable
            statusBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">${t('status_stable')}</span>`;
            rowIndicator = 'border-l-4 border-transparent';
        }

        const isRefrig = med.storage_status === 'Refrigerator';
        const isFreezer = med.storage_status === 'Freezer';
        const storageColor = isRefrig ? 'text-cyan-700 bg-cyan-50 border border-cyan-200' : isFreezer ? 'text-blue-700 bg-blue-50 border border-blue-200' : 'text-emerald-700 bg-emerald-50 border border-emerald-200';
        const storageDisplay = getStorageStatusText(med.storage_status);

        const isLowStock = med.quantity < 10 && med.quantity > 0;
        const isOutOfStock = med.quantity === 0;

        let qtyDisplay = '';
        if (isOutOfStock) {
            qtyDisplay = `<span class="text-rose-600 font-bold flex items-center justify-end space-x-1">
                             <i data-lucide="x-circle" class="w-3.5 h-3.5 mr-1"></i> Out of Stock (0)
                           </span>`;
        } else if (isLowStock) {
            qtyDisplay = `<span class="text-amber-600 font-semibold flex items-center justify-end space-x-1">
                 <i data-lucide="alert-triangle" class="w-3.5 h-3.5 mr-1"></i> ${med.quantity}
               </span>`;
        } else {
            qtyDisplay = `<span class="text-slate-700">${med.quantity}</span>`;
        }

        const priceDisplay = formatBaht(med.price_per_unit);
        const daysSubtext = isOutOfStock
            ? (currentLang === 'TH' ? 'ไม่มีในสต็อก' : 'No stock')
            : (days < 0 ? t('days_ago', { days: Math.abs(days) }) : t('days_left', { days: days }));

        // CRITICAL REQUIREMENT: med.name (Drug title) MUST remain 100% UNCHANGED
        tr.innerHTML = `
            <td class="px-6 py-4 font-semibold text-slate-800 ${rowIndicator}">${med.name}</td>
            <td class="px-6 py-4 text-slate-500 font-mono text-xs">${med.batch_number}</td>
            <td class="px-6 py-4 text-right">${qtyDisplay}</td>
            <td class="px-6 py-4 text-right text-slate-700 font-medium">${priceDisplay}</td>
            <td class="px-6 py-4 text-slate-700">
                <div>${med.expiry_date}</div>
                <div class="text-[10px] ${isOutOfStock || days < 0 ? 'text-red-600' : days <= 90 ? 'text-amber-600' : 'text-slate-400'} font-medium">
                    ${daysSubtext}
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 rounded-lg text-xs font-medium ${storageColor}">
                    ${storageDisplay}
                </span>
            </td>
            <td class="px-6 py-4">${statusBadge}</td>
        `;

        inventoryTableBody.appendChild(tr);
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// SEARCH
// ============================================================

let debounceTimeout;
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            fetchMedicines(e.target.value.trim());
        }, 300);
    });
}

// ============================================================
// FORM SUBMISSION
// ============================================================

if (addMedForm) {
    addMedForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const pricePerUnit = parseFloat(document.getElementById('med-price').value) || 0.0;

        const newMedicine = {
            hospital_id: currentHospitalId,
            name: document.getElementById('med-name').value.trim(),
            batch_number: document.getElementById('med-batch').value.trim(),
            quantity: parseInt(document.getElementById('med-qty').value),
            price_per_unit: pricePerUnit,
            expiry_date: document.getElementById('med-expiry').value,
            storage_status: document.getElementById('med-storage').value
        };

        try {
            const response = await fetch(`${API_BASE}/medicines`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newMedicine)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Failed to save medicine');
            }
        } catch (error) {
            console.log('API save unavailable, persisting to local isolated hospital dataset.');
            if (MOCK_HOSPITALS_DATA[currentHospitalId]) {
                newMedicine.id = Date.now();
                MOCK_HOSPITALS_DATA[currentHospitalId].medicines.push(newMedicine);
            }
        }

        closeModal();

        await fetchMedicines(searchInput ? searchInput.value.trim() : '');
        await fetchAlerts();
        await fetchDashboardSummary();
        await fetchAndRenderChart();
    });
}

// ============================================================
// CHART GENERATION
// ============================================================

async function fetchAndRenderChart() {
    try {
        const response = await fetch(`${API_BASE}/usage-trends`);
        let data = null;

        if (response.ok) {
            data = await response.json();
        } else {
            throw new Error('API error');
        }

        renderChartData(data);
    } catch (error) {
        // Fallback mock chart data tailored per hospital context
        const mockChartData = currentHospitalId === 'HOSP-A' 
            ? { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], data: [140, 210, 185, 230, 290, 310] }
            : { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], data: [65, 90, 80, 110, 130, 145] };
        renderChartData(mockChartData);
    }
}

function renderChartData(data) {
    if (!data) return;
    const canvas = document.getElementById('usageTrendsChart');
    if (!canvas) return;

    if (usageTrendsChartInstance) {
        usageTrendsChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.3)');
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

    usageTrendsChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: t('chart_dataset_label'),
                data: data.data,
                borderColor: '#0284c7',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointBackgroundColor: '#0284c7',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#ffffff',
                    bodyColor: '#38bdf8',
                    borderColor: '#cbd5e1',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: { color: '#e2e8f0', drawBorder: false },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: '#e2e8f0', drawBorder: false },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });
}

// Tab Switcher Logic
function switchTab(activeTab) {
    activeTabState = activeTab;

    dashboardView.classList.add('hidden');
    inventoryView.classList.add('hidden');
    mapView.classList.add('hidden');

    const inactiveClass = 'flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg transition duration-200 text-slate-500 hover:text-slate-800 hover:bg-white/50';
    const activeClass = 'flex items-center space-x-2 px-4 py-2 text-sm font-semibold bg-white text-sky-600 border border-slate-200 shadow-sm rounded-lg transition duration-200';

    tabDashboardBtn.className = inactiveClass;
    tabInventoryBtn.className = inactiveClass;
    tabTrackingBtn.className = inactiveClass;

    if (activeTab === 'dashboard') {
        dashboardView.classList.remove('hidden');
        tabDashboardBtn.className = activeClass;
        updateActiveViewLabel();
        fetchDashboardSummary();
        fetchAndRenderChart();
        
        if (trackingInterval) {
            clearInterval(trackingInterval);
            trackingInterval = null;
        }
    } else if (activeTab === 'inventory') {
        inventoryView.classList.remove('hidden');
        tabInventoryBtn.className = activeClass;
        updateActiveViewLabel();
        
        if (trackingInterval) {
            clearInterval(trackingInterval);
            trackingInterval = null;
        }
    } else if (activeTab === 'tracking') {
        mapView.classList.remove('hidden');
        tabTrackingBtn.className = activeClass;
        updateActiveViewLabel();
        
        initTrackingMap();
        startTrackingLoop();
        
        if (leafletMap) {
            setTimeout(() => {
                leafletMap.invalidateSize();
            }, 100);
        }
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

if (tabDashboardBtn && tabInventoryBtn && tabTrackingBtn) {
    tabDashboardBtn.addEventListener('click', () => switchTab('dashboard'));
    tabInventoryBtn.addEventListener('click', () => switchTab('inventory'));
    tabTrackingBtn.addEventListener('click', () => switchTab('tracking'));
}

// ============================================================
// SHIPMENT TRACKING SIMULATION
// ============================================================

function initTrackingMap() {
    if (leafletMap) {
        if (bkkMarker) bkkMarker.setPopupContent(`<b>${t('map_bkk_title')}</b><br>${t('map_bkk_desc')}`);
        if (nswMarker) nswMarker.setPopupContent(`<b>${t('map_nsw_title')}</b><br>${t('map_nsw_desc')}`);
        return;
    }

    const centerLat = (13.7563 + 15.7047) / 2;
    const centerLng = (100.5018 + 100.1372) / 2;

    leafletMap = L.map('map').setView([centerLat, centerLng], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);

    const startPoint = [13.7563, 100.5018];
    const endPoint = [15.7047, 100.1372];

    bkkMarker = L.marker(startPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(leafletMap).bindPopup(`<b>${t('map_bkk_title')}</b><br>${t('map_bkk_desc')}`);

    nswMarker = L.marker(endPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(leafletMap).bindPopup(`<b>${t('map_nsw_title')}</b><br>${t('map_nsw_desc')}`);

    routePolyline = L.polyline([startPoint, endPoint], {
        color: '#0284c7',
        weight: 3,
        opacity: 0.6,
        dashArray: '5, 10'
    }).addTo(leafletMap);

    vehicleMarker = L.marker(startPoint, {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(leafletMap).bindPopup(t('map_vehicle_title'));
}

function startTrackingLoop() {
    fetchTrackingData();
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(fetchTrackingData, 4000);
}

async function fetchTrackingData() {
    try {
        const response = await fetch('/api/tracking');
        if (!response.ok) throw new Error('Failed to fetch tracking data');
        const data = await response.json();

        lastTrackingData = data;
        updateTrackingUI(data);
    } catch (error) {
        // Fallback simulation telemetry data
        const mockTrackingData = {
            status: "In Transit",
            progress: 68,
            location: { latitude: 14.80, longitude: 100.32 },
            telemetry: { temperature: 4.2, humidity: 48 }
        };
        lastTrackingData = mockTrackingData;
        updateTrackingUI(mockTrackingData);
    }
}

function updateTrackingUI(data) {
    if (!data) return;

    const statusEl = document.getElementById('tracking-status');
    const tempEl = document.getElementById('tracking-temp');
    const humEl = document.getElementById('tracking-humidity');
    const latEl = document.getElementById('tracking-lat');
    const lngEl = document.getElementById('tracking-lng');
    const progressPctEl = document.getElementById('tracking-progress-pct');
    const progressBarEl = document.getElementById('tracking-progress-bar');

    const statusText = getIotStatusText(data.status);

    if (statusEl) statusEl.textContent = statusText;
    if (tempEl) tempEl.textContent = `${data.telemetry.temperature}°C`;
    if (humEl) humEl.textContent = `${data.telemetry.humidity}%`;
    if (latEl) latEl.textContent = data.location.latitude.toFixed(5);
    if (lngEl) lngEl.textContent = data.location.longitude.toFixed(5);
    if (progressPctEl) progressPctEl.textContent = `${data.progress}%`;
    if (progressBarEl) progressBarEl.style.width = `${data.progress}%`;

    if (vehicleMarker) {
        const newPos = [data.location.latitude, data.location.longitude];
        vehicleMarker.setLatLng(newPos);
        vehicleMarker.setPopupContent(`
            <div class="text-xs p-1">
                <p class="font-bold text-slate-800 mb-1">${t('map_vehicle_popup_title')}</p>
                <p class="text-slate-650"><span class="font-semibold">${t('th_status')}:</span> ${statusText}</p>
                <p class="text-slate-650"><span class="font-semibold">${t('track_temp_header')}:</span> <span class="text-rose-600 font-bold">${data.telemetry.temperature}°C</span></p>
                <p class="text-slate-650"><span class="font-semibold">${t('track_humidity_header')}:</span> <span class="text-blue-600 font-bold">${data.telemetry.humidity}%</span></p>
                <p class="text-slate-650"><span class="font-semibold">${t('track_progress_label')}:</span> ${data.progress}%</p>
            </div>
        `);
    }

    if (bkkMarker) bkkMarker.setPopupContent(`<b>${t('map_bkk_title')}</b><br>${t('map_bkk_desc')}`);
    if (nswMarker) nswMarker.setPopupContent(`<b>${t('map_nsw_title')}</b><br>${t('map_nsw_desc')}`);
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Language from localStorage (or default TH)
    setLanguage(currentLang);

    // Initialize Hospital Selector Listener
    const hospSelect = document.getElementById('hospital-select');
    if (hospSelect) {
        hospSelect.value = currentHospitalId;
        hospSelect.addEventListener('change', (e) => {
            setHospital(e.target.value);
        });
    }

    setHospital(currentHospitalId);

    if (window.lucide) {
        lucide.createIcons();
    }
});
