"""
AURIS Floor Plan Digitizer Utility
Converts a PDF screenshot/image floor plan into calibrated metric JSON for the AURIS HQ Dashboard.

Instructions:
1. Save a screenshot of your PDF floor plan as 'map.png' or 'map.jpg' in the current folder.
2. Run this script: python digitize_map.py
3. Follow the click instructions in the window and console.
4. Paste the resulting 'floor_plan.json' directly into the AURIS HQ upload tab!
"""

import cv2
import json
import math
import os
import sys

# Color definitions (BGR for OpenCV)
C_RED = (0, 0, 255)
C_GREEN = (0, 255, 0)
C_BLUE = (255, 0, 0)
C_YELLOW = (0, 255, 255)
C_WHITE = (255, 255, 255)
C_PURPLE = (255, 0, 255)

class MapDigitizer:
    def __init__(self, image_path):
        self.orig_img = cv2.imread(image_path)
        if self.orig_img is None:
            print(f"Error: Could not load image from '{image_path}'")
            sys.exit(1)
            
        # Downscale for editing if too large for typical screen sizes
        h, w = self.orig_img.shape[:2]
        self.scale_factor = 1.0
        max_dim = 1000
        if max(h, w) > max_dim:
            self.scale_factor = max_dim / float(max(h, w))
            self.img = cv2.resize(self.orig_img, (0,0), fx=self.scale_factor, fy=self.scale_factor)
        else:
            self.img = self.orig_img.copy()
            
        self.display_img = self.img.copy()
        
        # State variables
        self.clicks = []
        self.px_per_meter = None
        self.origin = None # (x, y) in pixels
        
        # Output geometry
        self.boundary = []   # List of dicts: {'x_m': f, 'y_m': f}
        self.walls = []      # List of dicts: {'start': {'x_m': f, 'y_m': f}, 'end': {'x_m': f, 'y_m': f}}
        self.openings = []   # List of dicts: {'start': {'x_m': f, 'y_m': f}, 'end': {'x_m': f, 'y_m': f}}
        self.obstacles = []  # List of lists of dicts
        
        # Current drawing state
        self.temp_points = []
        
    def to_meters(self, pt):
        """Converts raw screen pixel coords to scaled meters relative to the origin."""
        # Calculate offset from origin in pixels (y-axis inverted for standard Cartesian geometry)
        dx_px = (pt[0] - self.origin[0]) / self.scale_factor
        dy_px = (self.origin[1] - pt[1]) / self.scale_factor
        
        x_m = round(dx_px / self.px_per_meter, 3)
        y_m = round(dy_px / self.px_per_meter, 3)
        return {"x_m": x_m, "y_m": y_m}

    def run(self):
        cv2.namedWindow("AURIS Floor Plan Digitizer")
        
        # ── STEP 1: CALIBRATION ──
        print("\n--- STEP 1: CALIBRATION ---")
        print("1. Find a wall or scale bar with a KNOWN real-world length in your map.")
        print("2. Click the START point of this known length in the window.")
        print("3. Click the END point of this known length in the window.")
        
        cv2.setMouseCallback("AURIS Floor Plan Digitizer", self.click_callback_calibration)
        while self.px_per_meter is None:
            self.draw_overlay("STEP 1: Click start and end points of a known length")
            cv2.imshow("AURIS Floor Plan Digitizer", self.display_img)
            key = cv2.waitKey(20) & 0xFF
            if key == 27: # ESC
                cv2.destroyAllWindows()
                return

        # ── STEP 2: DEFINE BOUNDARY ──
        print("\n--- STEP 2: TRACE THE OUTER BOUNDARY ---")
        print("Click sequential corners around the outer walls of the room/floor plan.")
        print("Press 'Enter' or 'Space' once you have clicked all corners to complete the polygon loop.")
        
        self.clicks = []
        cv2.setMouseCallback("AURIS Floor Plan Digitizer", self.click_callback_boundary)
        tracing = True
        while tracing:
            self.draw_overlay("STEP 2: Click corners of outer boundary. Press ENTER when done.")
            cv2.imshow("AURIS Floor Plan Digitizer", self.display_img)
            key = cv2.waitKey(20) & 0xFF
            if key in [13, 32]: # ENTER or SPACE
                if len(self.clicks) >= 3:
                    # Map coordinates to metric space
                    self.boundary = [self.to_meters(p) for p in self.clicks]
                    tracing = False
                else:
                    print("Error: Boundary polygon needs at least 3 points!")
            elif key == 27: # ESC
                cv2.destroyAllWindows()
                return
                
        # Draw completed boundary permanently on backup image
        self.draw_solid_polygon(self.clicks, C_GREEN, 2)
        
        # ── STEP 3: TRACE INNER WALLS ──
        print("\n--- STEP 3: TRACE WALL SEGMENTS ---")
        print("Click pair of points (Start, then End) for each wall segment.")
        print("Press 'Enter' or 'Space' when you are done tracing all walls.")
        
        self.clicks = []
        cv2.setMouseCallback("AURIS Floor Plan Digitizer", self.click_callback_segments)
        tracing = True
        while tracing:
            self.draw_overlay("STEP 3: Click point-pairs to draw walls. Press ENTER when done.")
            cv2.imshow("AURIS Floor Plan Digitizer", self.display_img)
            key = cv2.waitKey(20) & 0xFF
            if key in [13, 32]: # ENTER or SPACE
                tracing = False
            elif key == 27: # ESC
                cv2.destroyAllWindows()
                return
                
        # Draw completed walls permanently on backup image
        for wall in self.walls:
            # Convert metric back to local px for permanent overlay
            p1 = self.to_px(wall['start'])
            p2 = self.to_px(wall['end'])
            cv2.line(self.img, p1, p2, C_WHITE, 3)

        # ── STEP 4: TRACE OPENINGS/DOORS ──
        print("\n--- STEP 4: TRACE DOORS / ENTRANCES ---")
        print("Click pair of points (Start, then End) for each opening or door.")
        print("Press 'Enter' or 'Space' when you are done.")
        
        self.clicks = []
        cv2.setMouseCallback("AURIS Floor Plan Digitizer", self.click_callback_openings)
        tracing = True
        while tracing:
            self.draw_overlay("STEP 4: Click point-pairs to draw doors/openings. Press ENTER when done.")
            cv2.imshow("AURIS Floor Plan Digitizer", self.display_img)
            key = cv2.waitKey(20) & 0xFF
            if key in [13, 32]: # ENTER or SPACE
                tracing = False
            elif key == 27: # ESC
                cv2.destroyAllWindows()
                return
                
        # Draw completed openings permanently on backup image
        for op in self.openings:
            p1 = self.to_px(op['start'])
            p2 = self.to_px(op['end'])
            cv2.line(self.img, p1, p2, C_BLUE, 4)

        # ── STEP 5: TRACE OBSTACLES (COLUMNS, FURNITURE, ETC.) ──
        print("\n--- STEP 5: TRACE OBSTACLES ---")
        print("Trace column, machine, or counter polygons.")
        print("1. Click points to outline an obstacle polygon.")
        print("2. Press 'c' to complete and close the current obstacle loop.")
        print("3. Click points to start another obstacle, or press 'Enter' to finish entirely.")
        
        self.clicks = []
        cv2.setMouseCallback("AURIS Floor Plan Digitizer", self.click_callback_obstacles)
        tracing = True
        while tracing:
            self.draw_overlay("STEP 5: Outline obstacles. Press 'c' to close current loop, ENTER to finish.")
            cv2.imshow("AURIS Floor Plan Digitizer", self.display_img)
            key = cv2.waitKey(20) & 0xFF
            if key == ord('c'):
                if len(self.clicks) >= 3:
                    obs_metric = [self.to_meters(p) for p in self.clicks]
                    self.obstacles.append(obs_metric)
                    self.draw_solid_polygon(self.clicks, C_RED, 2)
                    self.clicks = []
                else:
                    print("Error: Obstacle polygon needs at least 3 points to close!")
            elif key in [13, 32]: # ENTER or SPACE
                tracing = False
            elif key == 27: # ESC
                cv2.destroyAllWindows()
                return

        cv2.destroyAllWindows()
        self.save_json()

    def to_px(self, metric_pt):
        """Converts metric point back to local scaled display pixels."""
        x_px = int((metric_pt['x_m'] * self.px_per_meter * self.scale_factor) + self.origin[0])
        y_px = int(self.origin[1] - (metric_pt['y_m'] * self.px_per_meter * self.scale_factor))
        return (x_px, y_px)

    def draw_solid_polygon(self, pts, color, thickness=2):
        for i in range(len(pts)):
            cv2.line(self.img, pts[i], pts[(i+1)%len(pts)], color, thickness)

    def draw_overlay(self, message):
        self.display_img = self.img.copy()
        
        # Render current message bar on screen
        cv2.rectangle(self.display_img, (0, 0), (self.display_img.shape[1], 40), (20, 20, 30), -1)
        cv2.putText(self.display_img, message, (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, C_YELLOW, 1, cv2.LINE_AA)
        
        # Render dynamic visual feedback based on active clicks
        for i, pt in enumerate(self.clicks):
            cv2.circle(self.display_img, pt, 4, C_GREEN, -1)
            cv2.putText(self.display_img, str(i), (pt[0]+8, pt[1]-8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, C_GREEN, 1)
            
        # Draw dynamic boundary connection
        if len(self.clicks) > 1:
            for i in range(len(self.clicks) - 1):
                cv2.line(self.display_img, self.clicks[i], self.clicks[i+1], C_GREEN, 2)

    def click_callback_calibration(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.clicks.append((x, y))
            cv2.circle(self.img, (x, y), 5, C_BLUE, -1)
            
            if len(self.clicks) == 2:
                # Ask user for size in terminal
                cv2.line(self.img, self.clicks[0], self.clicks[1], C_BLUE, 2)
                cv2.imshow("AURIS Floor Plan Digitizer", self.img)
                cv2.waitKey(100)
                
                dx = (self.clicks[1][0] - self.clicks[0][0]) / self.scale_factor
                dy = (self.clicks[1][1] - self.clicks[0][1]) / self.scale_factor
                px_distance = math.hypot(dx, dy)
                
                print(f"Captured pixel distance: {px_distance:.2f} px")
                while True:
                    try:
                        val = input("Enter real-world length of this segment in METERS (e.g., 8.5): ")
                        real_meters = float(val)
                        if real_meters <= 0:
                            raise ValueError
                        break
                    except ValueError:
                        print("Invalid entry. Please enter a positive number.")
                
                self.px_per_meter = px_distance / real_meters
                # Set origin to the first point of the scale line
                self.origin = self.clicks[0]
                print(f"Calibration successful: {self.px_per_meter:.2f} pixels per meter.")
                self.clicks = []

    def click_callback_boundary(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.clicks.append((x, y))

    def click_callback_segments(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.clicks.append((x, y))
            cv2.circle(self.display_img, (x, y), 4, C_WHITE, -1)
            
            if len(self.clicks) == 2:
                w_start = self.to_meters(self.clicks[0])
                w_end = self.to_meters(self.clicks[1])
                self.walls.append({
                    "start": w_start,
                    "end": w_end,
                    "label": f"wall_{len(self.walls)}"
                })
                cv2.line(self.img, self.clicks[0], self.clicks[1], C_WHITE, 2)
                self.clicks = []

    def click_callback_openings(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.clicks.append((x, y))
            cv2.circle(self.display_img, (x, y), 4, C_BLUE, -1)
            
            if len(self.clicks) == 2:
                op_start = self.to_meters(self.clicks[0])
                op_end = self.to_meters(self.clicks[1])
                self.openings.append({
                    "start": op_start,
                    "end": op_end,
                    "label": f"door_{len(self.openings)}",
                    "kind": "door"
                })
                cv2.line(self.img, self.clicks[0], self.clicks[1], C_BLUE, 3)
                self.clicks = []

    def click_callback_obstacles(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.clicks.append((x, y))

    def save_json(self):
        output = {
            "floor_id": "floor_0",
            "name": "Calibrated Digitize Map",
            "source": "manual_pdf_digitizer",
            "confidence": 1.0,
            "boundary": self.boundary,
            "walls": self.walls,
            "openings": self.openings,
            "obstacles": self.obstacles
        }
        
        output_file = "floor_plan.json"
        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)
            
        print(f"\n✅ SUCCESS! Floor plan JSON exported to '{os.path.abspath(output_file)}'")
        print("Paste the entire content of this file directly into the Guided Scan Upload box at https://hq.skymlabs.com/\n")

if __name__ == "__main__":
    # Auto-find any png/jpg/jpeg in the current folder if not explicitly passed
    img_path = None
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
    else:
        candidates = [f for f in os.listdir('.') if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if candidates:
            img_path = candidates[0]
            print(f"Auto-selected image: '{img_path}'")
        
    if not img_path or not os.path.exists(img_path):
        print("Error: No input image found.")
        print("Please place a screenshot of your PDF named 'map.png' or 'map.jpg' in the current folder.")
        sys.exit(1)
        
    digitizer = MapDigitizer(img_path)
    digitizer.run()
