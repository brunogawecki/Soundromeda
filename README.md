# Soundromeda

> 3D visualizer of sound samples: explore and discover sounds visually instead of scrolling through long lists.

Samples are grouped by sound similarity for a more intuitive exploration experience.

---

## Quick Start

### Backend

1. **Pre-calculate embeddings** (optional, for built-in library):

   ```bash
   cd backend
   python scripts/build_builtin.py <sound_library_path> --copy
   ```

   Copies your sound sample library into `backend/status/audio/` and creates a built-in library. User sounds can also be uploaded later via the frontend.

2. **Run the backend**:

   ```bash
   cd backend
   uvicorn app.main:app
   ```

### Frontend

```bash
npm run dev
```

---

*In progress...*
