/**
 * Cloudinary avatar helper.
 *
 * Uploads go through the Clario backend (POST /avatar/upload) so the
 * Cloudinary API secret never touches the client. The backend does a
 * SIGNED upload and returns the hosted URL.
 */

import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://echo-yg4t.onrender.com';
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? 'dpri42wfi';

export interface CloudinaryResult {
  secure_url: string;
  public_id:  string;
}

/**
 * Upload a local image URI via the backend's /avatar/upload endpoint.
 * Uses XMLHttpRequest instead of fetch — RN's fetch does not support the
 * { uri, name, type } FormData file pattern but XHR does.
 */
export async function uploadAvatar(localUri: string, oldPublicIdOrUrl?: string): Promise<CloudinaryResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not signed in — please log in and try again.');
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', {
      uri:  localUri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    if (oldPublicIdOrUrl) {
      formData.append('old_public_id', oldPublicIdOrUrl);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/avatar/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${session!.access_token}`);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve({ secure_url: json.secure_url, public_id: json.public_id });
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error — check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out — try again.'));
    xhr.timeout = 30000;

    xhr.send(formData);
  });
}

/**
 * Build a Cloudinary delivery URL for an avatar at the given pixel size.
 * Accepts either a public_id or a full https URL.
 */
export function avatarUrl(publicIdOrUrl: string, size = 200): string {
  if (!publicIdOrUrl) return '';
  if (publicIdOrUrl.startsWith('http')) return publicIdOrUrl;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,g_face,w_${size},h_${size},f_auto,q_auto/${publicIdOrUrl}`;
}
