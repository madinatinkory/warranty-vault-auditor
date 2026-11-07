import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ReceiptData, StoredReceipt, ReceiptCategory } from '../types/receipt';
import { parseReceiptImage } from '../services/geminiParser';
import { insertReceipt } from '../services/database';
import { scheduleReceiptReminders } from '../services/notificationService';

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateDeadlines(
  purchaseDateStr: string,
  returnWindowDays: number,
  warrantyMonths: number
): { returnDeadline: string; warrantyDeadline: string | null } {
  const parts = purchaseDateStr.split('-').map(Number);
  const year = parts[0] || new Date().getFullYear();
  const month = parts[1] ? parts[1] - 1 : new Date().getMonth();
  const day = parts[2] || new Date().getDate();

  const baseDate = new Date(year, month, day, 12, 0, 0);

  // Return Deadline calculation
  const returnDate = new Date(baseDate);
  returnDate.setDate(returnDate.getDate() + (Number(returnWindowDays) || 0));
  const returnDeadline = formatDate(returnDate);

  // Warranty Deadline calculation
  let warrantyDeadline: string | null = null;
  const months = Number(warrantyMonths) || 0;
  if (months > 0) {
    const warrantyDate = new Date(baseDate);
    warrantyDate.setMonth(warrantyDate.getMonth() + months);
    warrantyDeadline = formatDate(warrantyDate);
  }

  return { returnDeadline, warrantyDeadline };
}

interface ScanReceiptScreenProps {
  onSaved?: () => void;
  onClose?: () => void;
}

export default function ScanReceiptScreen({ onSaved, onClose }: ScanReceiptScreenProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Auditing receipt with Gemini AI...');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Form State
  const [storeName, setStoreName] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [warrantyMonths, setWarrantyMonths] = useState<string>('0');
  const [returnWindowDays, setReturnWindowDays] = useState<string>('30');
  const [category, setCategory] = useState<ReceiptCategory>('Other');
  const [currency, setCurrency] = useState<string>('Rs');

  const handleImagePicked = async (asset: ImagePicker.ImagePickerAsset) => {
    setImageUri(asset.uri);
    setIsLoading(true);
    setLoadingMessage('Auditing receipt with Gemini AI...');

    try {
      if (!asset.base64) {
        throw new Error('Could not obtain base64 image data.');
      }
      const parsed = await parseReceiptImage(asset.base64);
      setReceiptData(parsed);

      // Populate editable fields
      setStoreName(parsed.storeName || '');
      setTotal(parsed.total !== undefined ? String(parsed.total) : '');
      setPurchaseDate(parsed.purchaseDate || formatDate(new Date()));
      setWarrantyMonths(parsed.warrantyMonths !== undefined ? String(parsed.warrantyMonths) : '0');
      setReturnWindowDays(parsed.returnWindowDays !== undefined ? String(parsed.returnWindowDays) : '30');
      setCategory(parsed.category || 'Other');
      setCurrency(parsed.currency || 'Rs');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse receipt.';
      Alert.alert('Analysis Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  const pickImageFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to capture receipts.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        base64: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleImagePicked(result.assets[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not launch camera.';
      Alert.alert('Camera Error', message);
    }
  };

  const pickImageFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Media library permission is required to select receipt photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        base64: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleImagePicked(result.assets[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open photo library.';
      Alert.alert('Gallery Error', message);
    }
  };

  const resetForm = () => {
    setImageUri(null);
    setReceiptData(null);
    setStoreName('');
    setTotal('');
    setPurchaseDate('');
    setWarrantyMonths('0');
    setReturnWindowDays('30');
    setCategory('Other');
    setCurrency('Rs');
  };

  const handleSaveToVault = () => {
    if (!imageUri) {
      Alert.alert('Error', 'No receipt image found.');
      return;
    }

    if (!storeName.trim()) {
      Alert.alert('Validation Error', 'Please enter a merchant / store name.');
      return;
    }

    const parsedTotal = parseFloat(total);
    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid total amount.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(purchaseDate.trim())) {
      Alert.alert('Validation Error', 'Purchase date must be formatted as YYYY-MM-DD.');
      return;
    }

    const numReturnDays = parseInt(returnWindowDays, 10) || 0;
    const numWarrantyMonths = parseInt(warrantyMonths, 10) || 0;

    const { returnDeadline, warrantyDeadline } = calculateDeadlines(
      purchaseDate.trim(),
      numReturnDays,
      numWarrantyMonths
    );

    const receiptId = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newStoredReceipt: StoredReceipt = {
      id: receiptId,
      storeName: storeName.trim(),
      purchaseDate: purchaseDate.trim(),
      currency: currency.trim() || 'Rs',
      items: receiptData?.items || [],
      subtotal: receiptData?.subtotal ?? parsedTotal,
      tax: receiptData?.tax ?? 0,
      total: parsedTotal,
      category,
      returnWindowDays: numReturnDays,
      warrantyMonths: numWarrantyMonths,
      notes: receiptData?.notes,
      imageUri,
      returnDeadline,
      warrantyDeadline,
      createdAt: Date.now(),
    };

    try {
      insertReceipt(newStoredReceipt);
      scheduleReceiptReminders(newStoredReceipt);
      Alert.alert(
        'Saved to Vault',
        'Receipt and warranty information have been securely stored in your vault.',
        [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              if (onSaved) {
                onSaved();
              }
            },
          },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save receipt.';
      Alert.alert('Database Error', message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-950"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        className="flex-1 px-4 pt-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-3xl font-extrabold text-white tracking-tight">Scan Receipt</Text>
            <Text className="text-slate-400 text-sm mt-1">
              Capture or upload receipts for automated AI audit & warranty tracking.
            </Text>
          </View>
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              className="bg-slate-900 border border-slate-800 p-2.5 rounded-full"
            >
              <Text className="text-slate-300 font-bold text-sm px-1">✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Capture / Upload Buttons */}
        {!isLoading && !receiptData && (
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-6 items-center shadow-lg mb-6">
            <View className="w-16 h-16 rounded-full bg-indigo-500/10 items-center justify-center mb-4 border border-indigo-500/20">
              <Text className="text-2xl">📸</Text>
            </View>
            <Text className="text-lg font-bold text-white text-center mb-1">
              Scan a New Receipt
            </Text>
            <Text className="text-slate-400 text-xs text-center mb-6">
              Gemini AI will extract merchant, dates, return windows, and warranties automatically.
            </Text>

            <View className="flex-row w-full gap-3">
              <TouchableOpacity
                onPress={pickImageFromCamera}
                activeOpacity={0.8}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-3.5 px-4 rounded-xl items-center justify-center shadow-md active:bg-indigo-700"
              >
                <Text className="text-white font-semibold text-sm">📷 Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={pickImageFromLibrary}
                activeOpacity={0.8}
                className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 py-3.5 px-4 rounded-xl items-center justify-center shadow-md active:bg-slate-600"
              >
                <Text className="text-slate-200 font-semibold text-sm">🖼️ Photo Library</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-8 items-center justify-center shadow-lg mb-6">
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                className="w-32 h-44 rounded-lg mb-6 opacity-70 bg-slate-800"
                resizeMode="cover"
              />
            )}
            <ActivityIndicator size="large" color="#6366f1" />
            <Text className="text-white font-semibold text-base mt-4 text-center">
              {loadingMessage}
            </Text>
            <Text className="text-slate-400 text-xs mt-1 text-center">
              Extracting line items, return deadlines, and warranty coverage...
            </Text>
          </View>
        )}

        {/* Editable Verification Card */}
        {receiptData && !isLoading && (
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl mb-6">
            <View className="flex-row items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <View>
                <Text className="text-lg font-bold text-white">Receipt Verification</Text>
                <Text className="text-xs text-slate-400">Review and adjust details before saving</Text>
              </View>
              <TouchableOpacity
                onPress={resetForm}
                className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700"
              >
                <Text className="text-xs font-medium text-slate-300">Retake</Text>
              </TouchableOpacity>
            </View>

            {/* Thumbnail Preview */}
            {imageUri && (
              <View className="flex-row items-center bg-slate-950 p-3 rounded-xl border border-slate-800 mb-5">
                <Image
                  source={{ uri: imageUri }}
                  className="w-16 h-20 rounded-md bg-slate-800 mr-3"
                  resizeMode="cover"
                />
                <View className="flex-1">
                  <Text className="text-white font-medium text-sm">Receipt Image Attached</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">Ready for vault archive</Text>
                </View>
              </View>
            )}

            {/* Form Fields */}
            <View className="space-y-4">
              {/* Merchant Name */}
              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Merchant / Store Name
                </Text>
                <TextInput
                  value={storeName}
                  onChangeText={setStoreName}
                  placeholder="e.g. Best Buy, Apple, Target"
                  placeholderTextColor="#64748b"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-base focus:border-indigo-500"
                />
              </View>

              {/* Total & Currency */}
              <View className="flex-row gap-3 mb-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Total Amount
                  </Text>
                  <TextInput
                    value={total}
                    onChangeText={setTotal}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#64748b"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-base font-bold focus:border-indigo-500"
                  />
                </View>

                <View className="w-24">
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Currency
                  </Text>
                  <TextInput
                    value={currency}
                    onChangeText={setCurrency}
                    placeholder="Rs"
                    placeholderTextColor="#64748b"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-base text-center font-bold focus:border-indigo-500"
                  />
                </View>
              </View>

              {/* Purchase Date */}
              <View className="mb-3">
                <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Purchase Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  value={purchaseDate}
                  onChangeText={setPurchaseDate}
                  placeholder="2026-11-07"
                  placeholderTextColor="#64748b"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-base focus:border-indigo-500"
                />
              </View>

              {/* Warranty Months & Return Window Days */}
              <View className="flex-row gap-3 mb-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Warranty (Months)
                  </Text>
                  <TextInput
                    value={warrantyMonths}
                    onChangeText={setWarrantyMonths}
                    keyboardType="numeric"
                    placeholder="12"
                    placeholderTextColor="#64748b"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-base focus:border-indigo-500"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Return Window (Days)
                  </Text>
                  <TextInput
                    value={returnWindowDays}
                    onChangeText={setReturnWindowDays}
                    keyboardType="numeric"
                    placeholder="30"
                    placeholderTextColor="#64748b"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-base focus:border-indigo-500"
                  />
                </View>
              </View>

              {/* Computed Deadlines Preview */}
              <View className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 mb-3">
                <Text className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                  Computed Deadlines
                </Text>
                {(() => {
                  const deadlines = calculateDeadlines(
                    purchaseDate || formatDate(new Date()),
                    parseInt(returnWindowDays, 10) || 0,
                    parseInt(warrantyMonths, 10) || 0
                  );
                  return (
                    <View className="space-y-1">
                      <View className="flex-row justify-between py-0.5">
                        <Text className="text-slate-400 text-xs">Return Deadline:</Text>
                        <Text className="text-white text-xs font-medium">
                          {deadlines.returnDeadline}
                        </Text>
                      </View>
                      <View className="flex-row justify-between py-0.5">
                        <Text className="text-slate-400 text-xs">Warranty Deadline:</Text>
                        <Text className="text-white text-xs font-medium">
                          {deadlines.warrantyDeadline || 'No warranty'}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>

              {/* Line Items Preview */}
              {receiptData.items && receiptData.items.length > 0 && (
                <View className="mb-4">
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Line Items ({receiptData.items.length})
                  </Text>
                  <View className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
                    {receiptData.items.map((item, index) => (
                      <View key={index} className="flex-row items-center justify-between p-3">
                        <View className="flex-1 pr-2">
                          <Text className="text-white text-xs font-medium" numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text className="text-slate-500 text-[10px]">
                            Qty: {item.quantity}
                          </Text>
                        </View>
                        <Text className="text-slate-300 text-xs font-semibold">
                          {currency || 'Rs'} {typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Save to Vault Button */}
            <TouchableOpacity
              onPress={handleSaveToVault}
              activeOpacity={0.8}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 py-4 rounded-xl items-center justify-center mt-2 shadow-lg"
            >
              <Text className="text-white font-bold text-base tracking-wide">
                💾 Save to Vault
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
