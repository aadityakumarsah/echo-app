import React, { useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Camera, User } from 'lucide-react-native';
import { uploadAvatar, avatarUrl } from '../lib/cloudinary';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  ImagePicker = require('expo-image-picker');
} catch {
  // Expo Go — works in dev/production builds
}

interface Props {
  currentAvatar?: string;    // secure_url of current image
  currentPublicId?: string;  // Cloudinary public_id of current image (for deletion)
  size?: number;
  onUploaded?: (url: string, publicId: string) => void;
}

export default function AvatarPicker({ currentAvatar, currentPublicId, size = 72, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const displayUrl = currentAvatar ? avatarUrl(currentAvatar, size * 2) : null;

  const pick = async () => {
    if (!ImagePicker) {
      Alert.alert('Coming soon', 'Profile photo upload will be available in the next version of the app.', [{ text: 'OK' }]);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const { secure_url, public_id } = await uploadAvatar(result.assets[0].uri, currentPublicId);
      await supabase.auth.updateUser({
        data: { avatar_url: secure_url, avatar_public_id: public_id },
      });
      onUploaded?.(secure_url, public_id);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={pick}
      disabled={uploading}
      activeOpacity={0.8}
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {displayUrl ? (
        <Image
          source={{ uri: displayUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <User size={size * 0.38} color={colors.warmGray} strokeWidth={1.6} />
        </View>
      )}
      <View style={[styles.badge, uploading && { backgroundColor: colors.border }]}>
        {uploading
          ? <ActivityIndicator size={10} color={colors.cocoa} />
          : <Camera size={10} color={colors.cocoa} strokeWidth={2.2} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignSelf: 'center' },
  placeholder: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.amber,
    borderWidth: 2, borderColor: colors.cream,
    alignItems: 'center', justifyContent: 'center',
  },
});
