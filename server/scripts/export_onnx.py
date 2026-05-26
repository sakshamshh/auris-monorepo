from ultralytics import YOLO
model = YOLO('yolov8n.pt')
model.export(format='onnx', imgsz=640, optimize=True, 
             int8=True, dynamic=False)
print('Exported to yolov8n.onnx')
