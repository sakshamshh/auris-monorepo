import os

def clear_buffers():
    # Get the directory where this script is located (edge/)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Define paths to the database buffer files
    paths_to_delete = [
        os.path.join(base_dir, "data", "frame_buffer.db"),
        os.path.join(base_dir, "data", "blob_buffer.db"),
        os.path.join(base_dir, "src", "data", "blob_buffer.db")
    ]
    
    for path in paths_to_delete:
        if os.path.exists(path):
            try:
                os.remove(path)
                print(f"Deleted: {path}")
            except Exception as e:
                print(f"Error deleting {path}: {e}")
                
    print("Buffer cleared. Restart edge_worker.py now.")

if __name__ == "__main__":
    clear_buffers()
