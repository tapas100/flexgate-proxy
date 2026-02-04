# 🎯 Feature 2: Visual Route Editor

**Branch:** `feature/admin-ui-routes`  
**Status:** 🚧 **IN PROGRESS**  
**Timeline:** Week 3-4 (Feb 2026)

---

## 📋 Requirements

### User Stories
1. As an admin, I want to **view all routes** in a table
2. As an admin, I want to **create new routes** with a form
3. As an admin, I want to **edit existing routes**
4. As an admin, I want to **delete routes** with confirmation
5. As an admin, I want to **enable/disable routes** with a toggle
6. As an admin, I want to **test routes** before saving
7. As an admin, I want to **validate route configuration**

---

## 🎨 Features

### 1. Route List View ✅
- Table with columns: Path, Upstream, Methods, Status, Actions
- Pagination (10 routes per page)
- Search/filter by path
- Sort by any column
- Enable/disable toggle
- Edit/Delete buttons

### 2. Create Route Form ✅
- Modal dialog
- Form fields:
  - Path (required, validated)
  - Upstream URL (required, validated)
  - Methods (multi-select: GET, POST, PUT, DELETE, PATCH)
  - Rate Limit (optional)
    - Requests per window
    - Window duration
  - Circuit Breaker (optional)
    - Enabled toggle
    - Failure threshold
- Real-time validation
- Submit/Cancel buttons

### 3. Edit Route ✅
- Pre-populated form
- Same validation as create
- Update functionality

### 4. Delete Route ✅
- Confirmation dialog
- Warning message
- Cancel/Delete buttons

### 5. Route Testing ✅
- Test button for each route
- Send test request
- Show response (status, headers, body)
- Error handling

---

## 📊 Deliverables

- [ ] RouteList component (table view)
- [ ] RouteForm component (create/edit form)
- [ ] RouteDialog component (modal wrapper)
- [ ] DeleteConfirmation component
- [ ] RouteService (API integration)
- [ ] Route validation utilities
- [ ] Unit tests (12 tests minimum)
- [ ] Integration tests

---

## 🧪 Testing Plan

### Unit Tests (12 tests)
1. RouteList renders empty state
2. RouteList renders with routes
3. RouteList pagination works
4. RouteList search/filter works
5. RouteForm validates path
6. RouteForm validates upstream
7. RouteForm submits correctly
8. RouteDialog opens/closes
9. DeleteConfirmation shows warning
10. RouteService creates route
11. RouteService updates route
12. RouteService deletes route

### Integration Tests
- Full CRUD workflow
- Error handling
- Loading states

---

## 📁 File Structure

```
admin-ui/src/
├── pages/
│   └── Routes/
│       ├── RouteList.tsx        (200 LOC)
│       ├── RouteForm.tsx        (150 LOC)
│       ├── RouteDialog.tsx      (80 LOC)
│       ├── DeleteDialog.tsx     (60 LOC)
│       ├── RouteTestDialog.tsx  (100 LOC)
│       └── __tests__/
│           ├── RouteList.test.tsx
│           ├── RouteForm.test.tsx
│           └── RouteDialog.test.tsx
├── services/
│   └── routes.ts                (120 LOC)
└── utils/
    └── validation.ts            (80 LOC)
```

**Total Estimated:** ~1,200 LOC

---

## 🎯 Success Criteria

- [ ] All CRUD operations work
- [ ] Form validation prevents invalid data
- [ ] UI is responsive and intuitive
- [ ] Error messages are clear
- [ ] Loading states are shown
- [ ] All tests passing (12+)
- [ ] No TypeScript errors
- [ ] Production build successful

---

**Starting development now!** 🚀
