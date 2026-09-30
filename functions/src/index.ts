// import * as functions from 'firebase-functions'
// import * as admin from 'firebase-admin'

// if (!admin.apps.length) admin.initializeApp()

// /**
//  * Admin-only: set Firebase Auth password for any uid.
//  * Called from the web app when an admin edits a staff password.
//  */
// export const adminSetPassword = functions.https.onCall(async (data, context) => {
//   if (!context.auth) {
//     throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')
//   }

//   const callerUid = context.auth.uid
//   const callerDoc = await admin.firestore().collection('users').doc(callerUid).get()
//   const caller = callerDoc.data()
//   if (!caller || caller.role !== 'admin' || caller.active === false) {
//     throw new functions.https.HttpsError('permission-denied', 'Admin only.')
//   }

//   const uid = String(data?.uid ?? '').trim()
//   const password = String(data?.password ?? '')
//   if (!uid || password.length < 8) {
//     throw new functions.https.HttpsError('invalid-argument', 'uid and a strong password are required.')
//   }

//   // Optional: block changing Main Admin password by non–Main Admin
//   const targetDoc = await admin.firestore().collection('users').doc(uid).get()
//   const target = targetDoc.data()
//   if (target?.isMainAdmin === true && caller.isMainAdmin !== true) {
//     throw new functions.https.HttpsError('permission-denied', 'Only the Main Admin can change that password.')
//   }

//   await admin.auth().updateUser(uid, { password })
//   return { ok: true }
// })

// import * as functions from 'firebase-functions'
// import * as admin from 'firebase-admin'

// if (!admin.apps.length) {
//   admin.initializeApp()
// }

// /**
//  * Admin-only: set Firebase Auth password for any uid.
//  * Called from the web app when an admin edits a staff password.
//  */
// export const adminSetPassword = functions.https.onCall(async (data, context) => {
//   if (!context.auth) {
//     throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')
//   }

//   const callerUid = context.auth.uid
//   const callerDoc = await admin.firestore().collection('users').doc(callerUid).get()
//   const caller = callerDoc.data()

//   if (!caller || caller.role !== 'admin' || caller.active === false) {
//     throw new functions.https.HttpsError('permission-denied', 'Admin only.')
//   }

//   const uid = String(data?.uid ?? '').trim()
//   const password = String(data?.password ?? '')

//   if (!uid || password.length < 8) {
//     throw new functions.https.HttpsError(
//       'invalid-argument',
//       'uid and a strong password are required.',
//     )
//   }

//   const targetDoc = await admin.firestore().collection('users').doc(uid).get()
//   const target = targetDoc.data()

//   if (target?.isMainAdmin === true && caller.isMainAdmin !== true) {
//     throw new functions.https.HttpsError(
//       'permission-denied',
//       'Only the Main Admin can change that password.',
//     )
//   }

//   await admin.auth().updateUser(uid, { password })
//   return { ok: true }
// })

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp()
}

/**
 * Admin-only: set Firebase Auth password for any uid.
 * Called from the web app when an admin edits a staff password.
 */
export const adminSetPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')
  }

  const callerUid = context.auth.uid
  const callerDoc = await admin.firestore().collection('users').doc(callerUid).get()
  const caller = callerDoc.data()

  if (!caller || caller.role !== 'admin' || caller.active === false) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.')
  }

  const uid = String(data?.uid ?? '').trim()
  const password = String(data?.password ?? '')

  if (!uid || password.length < 8) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'uid and a strong password are required.',
    )
  }

  const targetDoc = await admin.firestore().collection('users').doc(uid).get()
  const target = targetDoc.data()

  if (target?.isMainAdmin === true && caller.isMainAdmin !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only the Main Admin can change that password.',
    )
  }

  await admin.auth().updateUser(uid, { password })
  return { ok: true }
})