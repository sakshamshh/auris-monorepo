"""
AURIS Cloud Server — 30-Day PDF Report Generation Route (Phase 2).
Provides an API endpoint and a standalone CLI capability for auto-generation.
"""

import os
import sys
import logging
import argparse
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response

# Defensive sys.path update for standalone execution
PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PARENT_DIR not in sys.path:
    sys.path.append(PARENT_DIR)

# Setup logging
logger = logging.getLogger("AurisCloud.report_pdf")

router = APIRouter()

# Imports from db
try:
    from db import get_db, get_store_auth
except ImportError:
    # Fallback to local import if path resolving varies
    from ..db import get_db, get_store_auth

# Jinja2 and WeasyPrint imports
from jinja2 import Template
try:
    from weasyprint import HTML
except ImportError:
    logger.warning("WeasyPrint is not installed. PDF generation will fail unless installed.")


def _get_raw_db():
    """Defensively extract raw motor database from get_db."""
    conn = get_db()
    if hasattr(conn, "_db"):
        return conn._db
    return conn


def format_currency(val) -> str:
    """Formats values as currency strings with commas (e.g., 1,234,567)."""
    if val is None:
        return "0"
    try:
        return f"{int(float(val)):,}"
    except Exception:
        return str(val)


def format_float(val) -> str:
    """Formats float values with 2 decimal places and commas."""
    if val is None:
        return "0.00"
    try:
        return f"{float(val):,.2f}"
    except Exception:
        return str(val)


# HTML JINJA2 TEMPLATE STRING
HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {
        size: A4;
        margin: 20mm;
        @bottom-right {
            content: "Page " counter(page);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 8pt;
            color: #718096;
        }
        @bottom-left {
            content: "Auris Efficiency Report";
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 8pt;
            color: #718096;
        }
    }
    
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #2d3748;
        background-color: #ffffff;
        line-height: 1.6;
        font-size: 11pt;
    }
    
    .page {
        page-break-after: always;
        height: 230mm;
        display: block;
        box-sizing: border-box;
    }
    
    .page:last-child {
        page-break-after: avoid;
    }
    
    /* Cover Page */
    .cover-container {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 220mm;
        text-align: center;
        padding-top: 30mm;
    }
    
    .cover-logo {
        font-size: 42pt;
        font-weight: 800;
        color: #1A3C5E;
        letter-spacing: 2px;
        margin-bottom: 2mm;
    }
    
    .cover-logo-sub {
        font-size: 12pt;
        color: #718096;
        letter-spacing: 4px;
        text-transform: uppercase;
        margin-bottom: 25mm;
    }
    
    .cover-title {
        font-size: 26pt;
        font-weight: 700;
        color: #2d3748;
        line-height: 1.3;
        margin-bottom: 10px;
    }
    
    .cover-subtitle {
        font-size: 16pt;
        color: #4a5568;
        margin-bottom: 30mm;
    }
    
    .cover-meta {
        font-size: 12pt;
        color: #718096;
        margin-top: auto;
        padding-bottom: 10mm;
    }
    
    .cover-prepared {
        font-weight: 600;
        color: #1A3C5E;
        margin-top: 10px;
        font-size: 13pt;
    }
    
    /* Headings */
    h1 {
        font-size: 22pt;
        font-weight: 700;
        color: #1A3C5E;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 8px;
        margin-top: 0;
        margin-bottom: 20px;
    }
    
    h2 {
        font-size: 16pt;
        font-weight: 600;
        color: #1A3C5E;
        margin-top: 25px;
        margin-bottom: 15px;
    }
    
    p {
        margin-top: 0;
        margin-bottom: 15px;
    }
    
    /* Executive Cards */
    .summary-cards {
        margin-top: 25px;
    }
    
    .card {
        border-left: 6px solid #1A3C5E;
        background-color: #f7fafc;
        padding: 20px 25px;
        margin-bottom: 25px;
        border-radius: 4px;
    }
    
    .card.red-border {
        border-left-color: #DC2626;
    }
    
    .card-title {
        font-size: 10pt;
        font-weight: 600;
        color: #718096;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 8px;
    }
    
    .card-value {
        font-size: 28pt;
        font-weight: 800;
        color: #DC2626;
        margin-bottom: 10px;
        line-height: 1.1;
    }
    
    .card-desc {
        font-size: 11pt;
        color: #4a5568;
    }
    
    /* Tables */
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
        margin-bottom: 20px;
    }
    
    th, td {
        border: 1px solid #e2e8f0;
        padding: 12px 15px;
        text-align: left;
        font-size: 11pt;
    }
    
    th {
        background-color: #ebf2fa;
        color: #1A3C5E;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 9.5pt;
        letter-spacing: 0.5px;
    }
    
    tr.highlight-yellow {
        background-color: #fffdf5;
        font-weight: 600;
    }
    
    tr.highlight-yellow td {
        border-top: 2px solid #dd6b20;
        border-bottom: 2px solid #dd6b20;
    }
    
    tr.highlight-red {
        background-color: #fffafb;
        font-weight: 600;
    }
    
    tr.highlight-red td {
        border-top: 2px solid #e53e3e;
        border-bottom: 2px solid #e53e3e;
        color: #c53030;
    }
    
    .highlight-text-red {
        color: #DC2626;
        font-weight: 700;
    }
    
    .highlight-text-navy {
        color: #1A3C5E;
        font-weight: 700;
    }
    
    /* Callout & Messages */
    .insufficient-box {
        background-color: #f7fafc;
        border: 1px dashed #cbd5e0;
        padding: 40px;
        text-align: center;
        color: #718096;
        font-size: 12pt;
        border-radius: 6px;
        margin-top: 30px;
    }
    
    .worst-box {
        background-color: #fffdf5;
        border: 1px solid #fbd38d;
        padding: 15px 20px;
        border-radius: 4px;
        margin-top: 25px;
        font-size: 11pt;
    }
    
    /* List items */
    .pattern-item {
        border-bottom: 1px solid #e2e8f0;
        padding: 18px 0;
    }
    
    .pattern-item:last-child {
        border-bottom: none;
    }
    
    .pattern-header {
        display: flex;
        justify-content: space-between;
        font-weight: 600;
        color: #1A3C5E;
        margin-bottom: 8px;
        font-size: 12pt;
    }
    
    .pattern-meta {
        font-size: 10.5pt;
        color: #4a5568;
    }
    
    .pattern-cost {
        color: #DC2626;
        font-weight: 700;
    }
    
    /* Contact page */
    .contact-container {
        margin-top: 40mm;
        text-align: center;
    }
    
    .contact-card {
        background-color: #f7fafc;
        border: 1px solid #e2e8f0;
        padding: 35px;
        border-radius: 6px;
        display: inline-block;
        width: 80%;
        margin-top: 25px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
    }
    
    .contact-name {
        font-size: 20pt;
        font-weight: 700;
        color: #1A3C5E;
        margin-bottom: 8px;
    }
    
    .contact-phone {
        font-size: 15pt;
        color: #2d3748;
        margin-bottom: 20px;
    }
    
    .contact-link {
        font-size: 15pt;
        color: #3182ce;
        text-decoration: none;
        font-weight: 600;
    }
    
</style>
</head>
<body>

    <!-- PAGE 1: COVER PAGE -->
    <div class="page">
        <div class="cover-container">
            <div>
                <div class="cover-logo">AURIS</div>
                <div class="cover-logo-sub">Spatial Intelligence</div>
            </div>
            
            <div>
                <div class="cover-title">30-Day Manufacturing Efficiency Report</div>
                <div class="cover-subtitle">{{ factory_name }}</div>
            </div>
            
            <div class="cover-meta">
                <div>Period: <strong>{{ period_start }} — {{ period_end }}</strong></div>
                <div class="cover-prepared">Prepared by Skym Labs</div>
            </div>
        </div>
    </div>

    <!-- PAGE 2: EXECUTIVE SUMMARY -->
    <div class="page">
        <h1>Executive Summary</h1>
        <p style="font-size: 12pt; color: #4a5568; margin-bottom: 25px;">
            This report summarizes the operational waste, bottleneck impacts, and high-frequency recurring efficiency loss patterns captured by the Auris Spatial Intelligence System over the last 30 days.
        </p>
        
        <div class="summary-cards">
            <div class="card red-border">
                <div class="card-title">Total Dead Time Cost</div>
                <div class="card-value">₹{{ format_currency(dead_cost_inr) }}</div>
                <div class="card-desc">Total financial loss incurred from accumulated worker idle hours across all active workstation zones.</div>
            </div>
            
            <div class="card">
                <div class="card-title">Top Bottleneck Cascade Loss</div>
                <div class="card-value">₹{{ format_currency(top_bottleneck_cost) }}</div>
                <div class="card-desc">Production loss triggered by downstream delay cascades originating from the primary bottleneck station.</div>
            </div>
            
            <div class="card">
                <div class="card-title">Top Recurrent Pattern Loss</div>
                <div class="card-value">₹{{ format_currency(top_pattern_cost) }}</div>
                <div class="card-desc">Projected monthly loss if repetitive workstation occupancy dips and slot-based absences are left unresolved.</div>
            </div>
        </div>
    </div>

    <!-- PAGE 3: DEAD TIME -->
    <div class="page">
        <h1>Workstation Dead Time Analysis</h1>
        <p>
            Dead time measures active hours where worker presence fell below the baseline threshold needed to maintain workstation productivity.
        </p>
        
        <table>
            <thead>
                <tr>
                    <th>Zone / Workstation</th>
                    <th style="text-align: right;">Dead Hours</th>
                    <th style="text-align: right;">Productive Hours</th>
                    <th style="text-align: right;">Calculated Loss</th>
                </tr>
            </thead>
            <tbody>
                {% for zone in by_zone %}
                <tr class="{% if zone.zone_label == worst_zone %}highlight-yellow{% endif %}">
                    <td>{{ zone.zone_label }}</td>
                    <td style="text-align: right;">{{ format_float(zone.dead_hours) }} hrs</td>
                    <td style="text-align: right;">{{ format_float(zone.productive_hours) }} hrs</td>
                    <td style="text-align: right; {% if zone.zone_label == worst_zone %}color: #dd6b20;{% endif %}">₹{{ format_currency(zone.dead_cost_inr) }}</td>
                </tr>
                {% else %}
                <tr>
                    <td colspan="4" style="text-align: center; color: #718096;">No workstation dead time data recorded during this period.</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
        
        {% if by_zone %}
        <div class="worst-box">
            <div style="font-weight: 700; margin-bottom: 5px; color: #dd6b20; text-transform: uppercase; font-size: 9.5pt; letter-spacing: 0.5px;">Key Inefficiency Insights</div>
            <div>Worst Performing Workstation: <strong class="highlight-text-navy">{{ worst_zone }}</strong></div>
            <div>Day of Highest System Idle Time: <strong class="highlight-text-navy">{{ worst_day }}</strong></div>
            <div style="margin-top: 10px; font-size: 10pt; color: #4a5568;">
                Total Expected Work Hours: <strong>{{ format_float(expected_hours_total) }} hrs</strong> | 
                Total Productive Work Hours: <strong>{{ format_float(productive_hours_total) }} hrs</strong>
            </div>
        </div>
        {% endif %}
    </div>

    <!-- PAGE 4: BOTTLENECK -->
    <div class="page">
        <h1>Downstream Bottleneck Cascades</h1>
        <p>
            Workstations that consistently stall downstream operations, leading to cascade idle times across linked production sectors.
        </p>
        
        {% if insufficient_bottlenecks %}
        <div class="insufficient-box">
            <strong style="color: #4a5568; display: block; margin-bottom: 10px; font-size: 13pt;">Insufficient Data</strong>
            Workstation bottleneck models require 7 full operational days of data to compute accurate propagation cascades. Please check back after Day 7.
        </div>
        {% else %}
        <table>
            <thead>
                <tr>
                    <th>Station</th>
                    <th style="text-align: right;">Events</th>
                    <th style="text-align: right;">Avg Duration</th>
                    <th style="text-align: right;">Cascade Cost</th>
                    <th style="text-align: right;">Output Gain</th>
                </tr>
            </thead>
            <tbody>
                {% for station in top_3_bottlenecks %}
                <tr class="{% if loop.index == 1 %}highlight-red{% endif %}">
                    <td>{{ station.zone_label }}</td>
                    <td style="text-align: right;">{{ station.event_count }}</td>
                    <td style="text-align: right;">{{ format_float(station.avg_duration_minutes) }} mins</td>
                    <td style="text-align: right;">₹{{ format_currency(station.total_cost_inr) }}</td>
                    <td style="text-align: right; font-weight: 700;">+{{ format_float(station.projected_gain_pct) }}%</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
        
        {% if top_3_bottlenecks %}
        <div style="margin-top: 25px; padding: 15px; border-left: 4px solid #DC2626; background-color: #fffafb; font-size: 11pt;">
            The primary bottleneck station is <strong style="color: #DC2626;">{{ top_3_bottlenecks[0].zone_label }}</strong>. 
            Resolving the delays at this station is projected to recover <strong style="color: #DC2626;">₹{{ format_currency(top_3_bottlenecks[0].total_cost_inr) }}</strong> in cascade waste and boost total factory output by <strong style="color: #DC2626;">{{ format_float(top_3_bottlenecks[0].projected_gain_pct) }}%</strong>.
        </div>
        {% endif %}
        {% endif %}
    </div>

    <!-- PAGE 5: RECURRING PATTERNS -->
    <div class="page">
        <h1>Recurring Waste & Absence Patterns</h1>
        <p>
            Consistent, high-confidence workstation drops identified during specific daily time slots. These represent highly repetitive behavioral or operational losses.
        </p>
        
        {% if insufficient_patterns %}
        <div class="insufficient-box">
            <strong style="color: #4a5568; display: block; margin-bottom: 10px; font-size: 13pt;">Insufficient Data</strong>
            Recurrence slot models require a minimum of 7 days of aggregated zone timelines to identify repetitive patterns. Please check back after Day 7.
        </div>
        {% else %}
        <div style="margin-top: 15px;">
            {% for pattern in top_3_patterns %}
            <div class="pattern-item">
                <div class="pattern-header">
                    <span>Zone: {{ pattern.zone_label }}</span>
                    <span class="pattern-cost">₹{{ format_currency(pattern.monthly_cost_inr) }}/mo</span>
                </div>
                <div class="pattern-meta">
                    Time Slot: <strong>{{ pattern.hour_label }}</strong> | 
                    Recurrence: <strong>{{ pattern.recurrence_count }} times</strong> | 
                    Confidence: <strong>{{ (pattern.confidence * 100) | round | int }}%</strong>
                </div>
            </div>
            {% endfor %}
        </div>
        {% endif %}
    </div>

    <!-- PAGE 6: FINANCIAL ROI SUMMARY -->
    <div class="page">
        <h1>Financial ROI Summary</h1>
        <p>
            Comparison of factory waste and operational losses captured by Auris against the subscription cost of the Auris Spatial Intelligence platform.
        </p>
        
        <table>
            <thead>
                <tr>
                    <th>Line Item Description</th>
                    <th style="text-align: right; width: 35%;">Monthly Impact</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Total Tracked Workstation Loss (Dead Time + Cascades)</td>
                    <td style="text-align: right; color: #DC2626; font-weight: 700;">₹{{ format_currency(total_monthly_loss) }}</td>
                </tr>
                <tr>
                    <td>Auris Spatial Intelligence Subscription Fee</td>
                    <td style="text-align: right; color: #2d3748; font-weight: 600;">- ₹75,000</td>
                </tr>
                <tr style="background-color: #ebf2fa; font-weight: 700; font-size: 12pt;">
                    <td style="color: #1A3C5E;">Net Recoverable ROI / Month</td>
                    <td style="text-align: right; color: #2b6cb0;">₹{{ format_currency(net_savings) }}</td>
                </tr>
            </tbody>
        </table>
        
        <div style="margin-top: 30px; background-color: #f7fafc; padding: 25px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11pt; line-height: 1.6;">
            <strong>Auris ROI Framework:</strong><br>
            Auris monitors and alerts shopfloor supervisors in real time to correct worker drift and resolve process bottlenecks immediately. 
            By eliminating just <strong>30%</strong> of the captured shopfloor waste, the Auris subscription is fully self-funded and generates clear positive net monthly savings.
        </div>
    </div>

    <!-- PAGE 7: NEXT STEPS -->
    <div class="page">
        <h1>Next Steps</h1>
        <p style="text-align: center; margin-top: 15mm; font-size: 12pt; color: #4a5568;">
            Auris is currently running in a limited data trial mode. To unlock real-time SMS alerts, live dashboard tracking, and continue access to comprehensive spatial analytics:
        </p>
        
        <div class="contact-container">
            <div class="contact-card">
                <div style="color: #718096; font-size: 10pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px;">Contact Client Success</div>
                <div class="contact-name">Ayush Sharma</div>
                <div style="font-size: 11pt; color: #4a5568; margin-bottom: 15px;">Co-founder & Head of Growth, Skym Labs</div>
                <div class="contact-phone">+91 99999 99999</div>
                <div>
                    <a href="https://auris.skymlabs.com" class="contact-link">auris.skymlabs.com</a>
                </div>
            </div>
            
            <p style="margin-top: 25mm; font-size: 10pt; color: #a0aec0;">
                Auris Spatial Intelligence Platform. All rights reserved. &copy; 2026 Skym Labs.
            </p>
        </div>
    </div>

</body>
</html>
"""


async def get_report_data(store_id: str, raw_db) -> Dict[str, Any]:
    """
    Asynchronously queries all necessary MongoDB collections and computes the metrics for the 30-day report.
    Guarantees no crash by returning robust defaults when data is missing or empty.
    """
    to_date_dt = datetime.now(timezone.utc)
    from_date_dt = to_date_dt - timedelta(days=30)
    hours_in_range = max((to_date_dt - from_date_dt).total_seconds() / 3600.0, 0.0)

    # 1. Fetch zone configurations to filter and map names
    zone_configs = {}
    try:
        async for z in raw_db.zone_config.find({"store_id": store_id}):
            z_id = z.get("zone_id")
            if z_id:
                zone_configs[z_id] = z
    except Exception as e:
        logger.error("Error fetching zone configurations for %s: %s", store_id, e)

    # 2. Query zone_hour_agg for dead time summary
    by_zone_data = {}
    idle_minutes_by_date = {}

    query = {
        "store_id": store_id,
        "hour_bucket": {"$gte": from_date_dt, "$lte": to_date_dt}
    }

    try:
        cursor = raw_db.zone_hour_agg.find(query)
        async for doc in cursor:
            zone_id = doc.get("zone_id")
            if not zone_id:
                continue

            zone_info = zone_configs.get(zone_id)
            # Filter to workstation zones if zone configs exist
            if zone_configs and (not zone_info or zone_info.get("zone_type") != "WORK_STATION"):
                continue

            idle_min = float(doc.get("idle_minutes") or 0.0)
            prod_min = float(doc.get("productive_minutes") or 0.0)
            cost = float(doc.get("idle_cost_inr") or doc.get("dead_cost_inr") or 0.0)

            if zone_id not in by_zone_data:
                by_zone_data[zone_id] = {
                    "zone_id": zone_id,
                    "zone_label": (zone_info.get("zone_label") or zone_info.get("label") if zone_info else None) or zone_id,
                    "idle_minutes": 0.0,
                    "productive_minutes": 0.0,
                    "dead_cost_inr": 0.0
                }
            by_zone_data[zone_id]["idle_minutes"] += idle_min
            by_zone_data[zone_id]["productive_minutes"] += prod_min
            by_zone_data[zone_id]["dead_cost_inr"] += cost

            bucket_date = doc.get("hour_bucket")
            if isinstance(bucket_date, datetime):
                date_str = bucket_date.date().isoformat()
            elif isinstance(bucket_date, str):
                date_str = bucket_date.split("T")[0]
            else:
                date_str = "unknown"

            idle_minutes_by_date[date_str] = idle_minutes_by_date.get(date_str, 0.0) + idle_min
    except Exception as e:
        logger.error("Error fetching dead time data from zone_hour_agg for %s: %s", store_id, e)

    # Aggregate summaries
    by_zone = []
    for zone_id, zdata in by_zone_data.items():
        by_zone.append({
            "zone_id": zone_id,
            "zone_label": zdata["zone_label"],
            "dead_hours": zdata["idle_minutes"] / 60.0,
            "productive_hours": zdata["productive_minutes"] / 60.0,
            "dead_cost_inr": zdata["dead_cost_inr"]
        })

    # Sort by dead cost descending
    by_zone = sorted(by_zone, key=lambda x: x["dead_cost_inr"], reverse=True)
    top_5_by_zone = by_zone[:5]

    productive_hours_total = sum(z["productive_hours"] for z in by_zone)
    dead_hours_total = sum(z["dead_hours"] for z in by_zone)
    dead_cost_inr_total = sum(z["dead_cost_inr"] for z in by_zone)

    # expected_hours_total = sum(expected_headcount * 1) * hours_in_range
    active_workstations = [
        z for z in zone_configs.values()
        if z.get("zone_type") == "WORK_STATION" and z.get("active") is True
    ]
    expected_headcount_sum = sum(float(z.get("expected_headcount") or 1.0) for z in active_workstations)
    expected_hours_total = expected_headcount_sum * hours_in_range

    worst_zone = ""
    if by_zone:
        worst_zone = by_zone[0]["zone_label"]

    worst_day = ""
    if idle_minutes_by_date:
        worst_day = max(idle_minutes_by_date, key=idle_minutes_by_date.get)

    # 3. Query bottleneck_cache
    top_3_bottlenecks = []
    insufficient_bottlenecks = True
    top_bottleneck_cost = 0.0

    try:
        cache_doc = await raw_db.bottleneck_cache.find_one({"store_id": store_id})
        if cache_doc:
            raw_stations = cache_doc.get("ranked_stations", [])
            ranked_stations = []
            for station in raw_stations:
                z_id = station.get("zone_id")
                z_info = zone_configs.get(z_id)
                z_label = (z_info.get("zone_label") or z_info.get("label") if z_info else None) or station.get("zone_label") or z_id
                ranked_stations.append({
                    "zone_id": z_id,
                    "zone_label": z_label,
                    "event_count": station.get("event_count", 0),
                    "avg_duration_minutes": station.get("avg_duration_minutes", 0.0),
                    "total_cascade_idle_hours": station.get("total_cascade_idle_hours", 0.0),
                    "total_cost_inr": station.get("total_cost_inr", 0.0),
                    "projected_gain_pct": station.get("projected_gain_pct", 0.0)
                })
            ranked_stations = sorted(ranked_stations, key=lambda x: x["total_cost_inr"], reverse=True)
            if ranked_stations:
                top_3_bottlenecks = ranked_stations[:3]
                insufficient_bottlenecks = False
                top_bottleneck_cost = top_3_bottlenecks[0]["total_cost_inr"]
    except Exception as e:
        logger.error("Error fetching bottleneck cache for %s: %s", store_id, e)

    # 4. Query pattern_flags
    top_3_patterns = []
    insufficient_patterns = True
    top_pattern_cost = 0.0

    try:
        cursor = raw_db.pattern_flags.find({"store_id": store_id, "active": True}).sort("monthly_cost_inr", -1)
        serialized_patterns = []
        async for p in cursor:
            z_id = p.get("zone_id")
            z_info = zone_configs.get(z_id)
            z_label = (z_info.get("zone_label") or z_info.get("label") if z_info else None) or p.get("zone_label") or z_id
            serialized_patterns.append({
                "zone_id": z_id,
                "zone_label": z_label,
                "hour_slot": p.get("hour_slot"),
                "hour_label": p.get("hour_label"),
                "recurrence_count": p.get("recurrence_count"),
                "avg_lost_hours": p.get("avg_lost_hours"),
                "monthly_cost_inr": p.get("monthly_cost_inr"),
                "confidence": p.get("confidence")
            })
        if serialized_patterns:
            top_3_patterns = serialized_patterns[:3]
            insufficient_patterns = False
            top_pattern_cost = top_3_patterns[0]["monthly_cost_inr"]
    except Exception as e:
        logger.error("Error fetching pattern flags for %s: %s", store_id, e)

    # Calculate Totals for ROI page
    total_monthly_loss = dead_cost_inr_total + top_bottleneck_cost
    net_savings = max(total_monthly_loss - 75000, 0.0)

    # Date formatting helper for Cover Page
    period_start = from_date_dt.strftime("%d %b %Y")
    period_end = to_date_dt.strftime("%d %b %Y")

    return {
        "period_start": period_start,
        "period_end": period_end,
        "expected_hours_total": expected_hours_total,
        "productive_hours_total": productive_hours_total,
        "dead_hours_total": dead_hours_total,
        "dead_cost_inr": dead_cost_inr_total,
        "by_zone": top_5_by_zone,
        "worst_zone": worst_zone,
        "worst_day": worst_day,
        "top_3_bottlenecks": top_3_bottlenecks,
        "top_3_patterns": top_3_patterns,
        "top_bottleneck_cost": top_bottleneck_cost,
        "top_pattern_cost": top_pattern_cost,
        "total_monthly_loss": total_monthly_loss,
        "net_savings": net_savings,
        "insufficient_bottlenecks": insufficient_bottlenecks,
        "insufficient_patterns": insufficient_patterns
    }


# ROUTE: GET /api/factory/report/pdf
@router.get("/api/factory/report/pdf")
async def generate_factory_report_pdf(request: Request):
    """
    Generates a high-quality 30-day PDF report for the factory.
    Requires store authentication headers: X-Store-ID + X-Password.
    """
    store_id = request.headers.get("X-Store-ID", "").strip()
    password = request.headers.get("X-Password", "")

    if not store_id:
        logger.warning("PDF report request missing X-Store-ID header")
        raise HTTPException(status_code=401, detail="Missing X-Store-ID header")

    if not password:
        logger.warning("PDF report request missing X-Password header")
        raise HTTPException(status_code=401, detail="Missing X-Password header")

    # 1. Authenticate store
    store = await get_store_auth(store_id, password)
    if not store:
        logger.warning("PDF report auth failure: invalid credentials for %s", store_id)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 2. Retrieve factory configuration to extract factory name
    raw_db = _get_raw_db()
    factory_config = await raw_db.factory_config.find_one({"store_id": store_id})
    if not factory_config:
        factory_config = {}

    factory_name = factory_config.get("factory_name") or store.get("name") or f"Store {store_id}"

    # 3. Gather 30-day report metrics
    report_data = await get_report_data(store_id, raw_db)

    # 4. Render HTML string with Jinja2
    try:
        template = Template(HTML_TEMPLATE)
        html_content = template.render(
            factory_name=factory_name,
            format_currency=format_currency,
            format_float=format_float,
            **report_data
        )
    except Exception as e:
        logger.error("Failed to render Jinja2 HTML string for %s: %s", store_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to generate report markup: {str(e)}")

    # 5. Convert HTML to PDF using WeasyPrint
    try:
        pdf_bytes = HTML(string=html_content).write_pdf()
    except Exception as e:
        logger.error("WeasyPrint failed to compile PDF for store %s: %s", store_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to compile PDF report binary.")

    # 6. Return Streaming Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=auris_report_{store_id}.pdf"}
    )


# STANDALONE CLI RUNNER FOR DAY 30 AUTO-GENERATION
async def run_standalone(store_id: Optional[str], output_path: Optional[str]):
    """
    Executes PDF generation standalone.
    If store_id is provided, generates report for that single store.
    If store_id is omitted, automatically finds all active (live) stores in DB and runs them.
    """
    logger.info("Initializing standalone PDF report generator")
    raw_db = _get_raw_db()

    stores_to_process = []
    if store_id:
        store = await raw_db.stores.find_one({"store_id": store_id})
        if not store:
            logger.error("Store ID '%s' not found in database.", store_id)
            return
        stores_to_process.append(store)
    else:
        # Auto-generation mode: find all live factories
        logger.info("No store ID provided. Finding all active (live) factories...")
        async for fc in raw_db.factory_config.find({"status": "live"}):
            s_id = fc.get("store_id")
            if s_id:
                store = await raw_db.stores.find_one({"store_id": s_id})
                if store:
                    stores_to_process.append(store)

    logger.info("Found %d stores to process.", len(stores_to_process))

    for store in stores_to_process:
        s_id = store["store_id"]
        fc = await raw_db.factory_config.find_one({"store_id": s_id}) or {}
        factory_name = fc.get("factory_name") or store.get("name") or f"Store {s_id}"

        out_file = output_path
        if not out_file:
            out_file = f"auris_report_{s_id}.pdf"

        logger.info("Generating 30-day report for store %s (%s) -> %s", s_id, factory_name, out_file)

        # Gather metrics
        report_data = await get_report_data(s_id, raw_db)

        # Render HTML
        template = Template(HTML_TEMPLATE)
        html_content = template.render(
            factory_name=factory_name,
            format_currency=format_currency,
            format_float=format_float,
            **report_data
        )

        # Convert to PDF using WeasyPrint
        try:
            pdf_bytes = HTML(string=html_content).write_pdf()
            with open(out_file, "wb") as f:
                f.write(pdf_bytes)
            logger.info("Successfully generated PDF: %s", out_file)
        except Exception as e:
            logger.error("Failed to generate standalone report for %s: %s", s_id, e, exc_info=True)


if __name__ == "__main__":
    # Setup standard console logging for standalone run
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    
    parser = argparse.ArgumentParser(description="Standalone Auris 30-Day PDF Report Generator")
    parser.add_argument("--store-id", type=str, default=None, help="Store ID of the factory")
    parser.add_argument("--output", type=str, default=None, help="Output path for the generated PDF")
    
    args = parser.parse_args()
    
    # Run async main loop
    asyncio.run(run_standalone(args.store_id, args.output))
