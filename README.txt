# Contract & Procurement Forum (Firebase, Admin Panel)

## IMPORTANT: Firestore Rules
To let admins add/remove admins via the Admin Panel, use these rules (note WRITE on /admins is allowed for admins):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null &&
             exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
    match /cases/{caseId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
                            (request.auth.uid == resource.data.ownerUid || isAdmin());
      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow update, delete: if request.auth != null &&
                              (request.auth.uid == resource.data.authorUid || isAdmin());
      }
    }
    match /admins/{uid} {
      allow read: if isAdmin();
      allow write: if isAdmin();  // allow admins to manage admins
    }
  }
}
```

1) First admin must be inserted manually in Firestore Console: create collection `admins`, document ID = your UID, field `isAdmin` = true.
2) After that, you can use the **Admin** page on your site to add/remove admins by UID.
