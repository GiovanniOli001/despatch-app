---
paths:
  - "frontend/**/*.js"
  - "frontend/**/*.html"
  - "frontend/**/*.css"
---

# Frontend Development Rules

## Security
- Always use `escapeHtml()` for user-provided content displayed in HTML
- Never use innerHTML with unsanitized user input

## UI Patterns

### Notifications
```javascript
showToast('Success message');
showToast('Error message', true);  // isError = true
```

### Confirmation Dialogs
```javascript
// Replace browser confirm() with:
showConfirmModal('Title', 'Message', () => {
  // On confirm callback
}, {
  isDangerous: true,      // Red confirm button
  confirmText: 'Delete',  // Custom button text
  cancelText: 'Cancel'
});
```

### API Calls
```javascript
// Use apiRequest from api.js
const data = await apiRequest('/endpoint', {
  method: 'POST',
  body: { key: 'value' }
});
```

## Time Handling
- Times stored as decimal hours (6.5 = 06:30, 14.75 = 14:45)
- Use existing conversion functions for display

## Existing Patterns
- Check existing code for similar functionality before creating new patterns
- Follow naming conventions already in use
- Use existing CSS classes before creating new ones
