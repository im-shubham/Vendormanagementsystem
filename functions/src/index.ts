/**
 * RCPL Vendor POD Management — Cloud Functions (2nd gen, callable).
 *
 * Every sensitive write happens here with the Admin SDK. The web app only
 * reads Firestore/Storage under security rules and uploads files into the
 * caller's own vendor folder.
 */
import { setGlobalOptions } from 'firebase-functions/options';

setGlobalOptions({
  region: process.env.APP_REGION || 'asia-south1',
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 60,
});

export { activateVendorAccount, completeVendorActivation } from './handlers/activation';
export { createVendor, updateVendor, deactivateVendor, reactivateVendor, listUploadVendors, linkVendorCategories, sendVendorInvite } from './handlers/vendors';
export { createStaffUser, updateStaffUser, setStaffActive } from './handlers/staff';
export { reviewVendorRegistration } from './handlers/registrations';
export { createPodSubmission, resubmitPodSubmission, updatePodStatus } from './handlers/pods';
