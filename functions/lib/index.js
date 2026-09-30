"use strict";
// import * as functions from 'firebase-functions'
// import * as admin from 'firebase-admin'
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSetPassword = void 0;
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
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
/**
 * Admin-only: set Firebase Auth password for any uid.
 * Called from the web app when an admin edits a staff password.
 */
exports.adminSetPassword = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    }
    const callerUid = context.auth.uid;
    const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();
    const caller = callerDoc.data();
    if (!caller || caller.role !== 'admin' || caller.active === false) {
        throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const uid = String((_a = data === null || data === void 0 ? void 0 : data.uid) !== null && _a !== void 0 ? _a : '').trim();
    const password = String((_b = data === null || data === void 0 ? void 0 : data.password) !== null && _b !== void 0 ? _b : '');
    if (!uid || password.length < 8) {
        throw new functions.https.HttpsError('invalid-argument', 'uid and a strong password are required.');
    }
    const targetDoc = await admin.firestore().collection('users').doc(uid).get();
    const target = targetDoc.data();
    if ((target === null || target === void 0 ? void 0 : target.isMainAdmin) === true && caller.isMainAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Only the Main Admin can change that password.');
    }
    await admin.auth().updateUser(uid, { password });
    return { ok: true };
});
//# sourceMappingURL=index.js.map