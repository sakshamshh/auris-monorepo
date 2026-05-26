# Auris Install Checklist

## Before you arrive
- [ ] Client onboarded in HQ portal (hq.skymlabs.com)
- [ ] All camera RTSP URLs added in HQ → Registry → System → Cameras
- [ ] N100 pre-flashed with setup.sh
- [ ] N100 .env has correct CLOUD_API_KEY and STORE_ID

## On site
- [ ] Connect N100 to factory WiFi (same network as cameras)
- [ ] Plug in power
- [ ] Wait 60 seconds
- [ ] Check HQ → Registry → client → System tab
  - Edge device should show ONLINE
  - Each camera should show ONLINE
- [ ] If cameras offline: check RTSP URLs in System tab

## After install
- [ ] After installing Ubuntu on edge device, immediately change password:
  ```bash
  passwd auris
  ```
  Use a strong password.
- [ ] Call Saksham to label zones remotely
- [ ] Saksham marks factory LIVE in HQ
- [ ] Tell client: "Data starts in 3 days. Report in 30 days."

## Troubleshoot
- Camera offline: check NVR is on same network
- Edge offline: check WiFi password, power
- SSH to N100: ssh auris@[N100-IP]
- Check logs: sudo journalctl -u auris-edge -f
