import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { StoredReceipt, ReceiptCategory, LineItem } from '../types/receipt';
import { generateClaimEmail } from '../services/geminiParser';

const SafeAreaView = styled(RNSafeAreaView);

interface ReceiptDetailModalProps {
  receipt: StoredReceipt | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const CATEGORY_COLORS: Record<ReceiptCategory, { bg: string; text: string; border: string }> = {
  Electronics: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
  Apparel: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  Groceries: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  Home: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  Other: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/20',
  },
};

function getDaysRemaining(targetDateStr: string | null): number | null {
  if (!targetDateStr) return null;
  const parts = targetDateStr.split('-').map(Number);
  if (parts.length !== 3) return null;

  const targetDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  const now = new Date();
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export default function ReceiptDetailModal({
  receipt,
  visible,
  onClose,
  onDelete,
}: ReceiptDetailModalProps) {
  if (!receipt) {
    return null;
  }

  const [isEmailGeneratorOpen, setIsEmailGeneratorOpen] = useState<boolean>(false);
  const [claimType, setClaimType] = useState<'warranty' | 'return'>('warranty');
  const [userReason, setUserReason] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [draftedEmail, setDraftedEmail] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const currencySymbol = receipt.currency || 'Rs';
  const categoryStyle = CATEGORY_COLORS[receipt.category] || CATEGORY_COLORS.Other;

  const returnDaysRemaining = getDaysRemaining(receipt.returnDeadline);
  const warrantyDaysRemaining = getDaysRemaining(receipt.warrantyDeadline);

  const handleGenerateEmail = async () => {
    if (!userReason.trim()) {
      Alert.alert(
        'Missing Description',
        'Please describe the issue or reason for the claim / return.'
      );
      return;
    }
    setIsGenerating(true);
    try {
      const email = await generateClaimEmail(receipt, claimType, userReason.trim());
      setDraftedEmail(email);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate claim email.';
      Alert.alert('Generation Error', message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!draftedEmail) return;
    try {
      await Clipboard.setStringAsync(draftedEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      Alert.alert('Copied!', 'Email draft has been copied to your clipboard.');
    } catch {
      Alert.alert('Error', 'Failed to copy to clipboard.');
    }
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Delete Receipt',
      `Are you sure you want to remove the receipt for "${receipt.storeName}" from your vault?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(receipt.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-slate-950" edges={['top', 'left', 'right', 'bottom']}>
        <View className="flex-1 p-5">
          {/* Header */}
          <View className="flex-row items-start justify-between pb-4 mb-2 border-b border-slate-800/80">
            <View className="flex-1 pr-3">
              <Text className="text-2xl font-bold text-white tracking-tight" numberOfLines={2}>
                {receipt.storeName}
              </Text>
              <View className="flex-row items-center gap-2 mt-2">
                <View
                  className={`px-3 py-1 rounded-full border ${categoryStyle.bg} ${categoryStyle.border}`}
                >
                  <Text className={`text-xs font-semibold ${categoryStyle.text}`}>
                    {receipt.category}
                  </Text>
                </View>
                <Text className="text-xs text-slate-400">
                  Purchased {receipt.purchaseDate}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="bg-slate-900 border border-slate-800 p-2.5 rounded-full items-center justify-center"
              accessibilityLabel="Close receipt details"
            >
              <Ionicons name="close" size={20} color="#cbd5e1" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Scanned Receipt Image */}
            {receipt.imageUri ? (
              <View className="my-4">
                <Image
                  source={{ uri: receipt.imageUri }}
                  className="rounded-2xl h-64 w-full bg-slate-900 border border-slate-800"
                  resizeMode="cover"
                />
              </View>
            ) : null}

            {/* Warranty & Return Timelines */}
            <View className="flex-row gap-3 my-3">
              {/* Return Window Card */}
              <View className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 justify-between">
                <View>
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Return Window
                    </Text>
                    <Ionicons name="swap-horizontal-outline" size={16} color="#94a3b8" />
                  </View>
                  <Text className="text-base font-bold text-white">
                    {receipt.returnWindowDays > 0 ? `${receipt.returnWindowDays} Days` : 'No Returns'}
                  </Text>
                  <Text className="text-xs text-slate-400 mt-1">
                    Expires: <Text className="text-slate-300 font-medium">{receipt.returnDeadline || 'N/A'}</Text>
                  </Text>
                </View>
                <View className="mt-3 pt-2.5 border-t border-slate-800/80">
                  {returnDaysRemaining !== null ? (
                    returnDaysRemaining > 0 ? (
                      <Text className="text-xs font-semibold text-amber-400">
                        ⏳ {returnDaysRemaining}d remaining
                      </Text>
                    ) : (
                      <Text className="text-xs font-semibold text-rose-400">
                        ✕ Return Expired
                      </Text>
                    )
                  ) : (
                    <Text className="text-xs text-slate-500">No deadline set</Text>
                  )}
                </View>
              </View>

              {/* Warranty Coverage Card */}
              <View className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 justify-between">
                <View>
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Warranty
                    </Text>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#34d399" />
                  </View>
                  <Text className="text-base font-bold text-white">
                    {receipt.warrantyMonths > 0 ? `${receipt.warrantyMonths} Months` : 'No Warranty'}
                  </Text>
                  <Text className="text-xs text-slate-400 mt-1">
                    Ends: <Text className="text-slate-300 font-medium">{receipt.warrantyDeadline || 'N/A'}</Text>
                  </Text>
                </View>
                <View className="mt-3 pt-2.5 border-t border-slate-800/80">
                  {receipt.warrantyMonths > 0 && warrantyDaysRemaining !== null ? (
                    warrantyDaysRemaining > 0 ? (
                      <Text className="text-xs font-semibold text-emerald-400">
                        ✓ {warrantyDaysRemaining}d remaining
                      </Text>
                    ) : (
                      <Text className="text-xs font-semibold text-rose-400">
                        ✕ Warranty Expired
                      </Text>
                    )
                  ) : (
                    <Text className="text-xs text-slate-500">Standard coverage</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Notes if present */}
            {receipt.notes ? (
              <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 my-2">
                <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Notes
                </Text>
                <Text className="text-xs text-slate-300 leading-relaxed">
                  {receipt.notes}
                </Text>
              </View>
            ) : null}

            {/* AI Claim / Return Email Assistant Section */}
            <View className="my-3">
              <TouchableOpacity
                onPress={() => setIsEmailGeneratorOpen(!isEmailGeneratorOpen)}
                activeOpacity={0.8}
                className="bg-indigo-600/20 border border-indigo-500/40 py-3 px-4 rounded-xl flex-row justify-center items-center gap-2"
              >
                <Text className="text-indigo-300 font-semibold text-sm">
                  ✨ Draft Claim / Return Email
                </Text>
                <Ionicons
                  name={isEmailGeneratorOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#a5b4fc"
                />
              </TouchableOpacity>

              {isEmailGeneratorOpen && (
                <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mt-3">
                  <Text className="text-white font-bold text-base mb-1">
                    AI Claim & Return Assistant
                  </Text>
                  <Text className="text-slate-400 text-xs mb-3.5">
                    Generate a formal email to customer support with purchase and warranty details.
                  </Text>

                  {/* Claim Type Toggle */}
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Claim Type
                  </Text>
                  <View className="flex-row gap-2 mb-3.5">
                    <TouchableOpacity
                      onPress={() => setClaimType('warranty')}
                      activeOpacity={0.7}
                      className={`flex-1 py-2.5 px-3 rounded-xl border items-center ${
                        claimType === 'warranty'
                          ? 'bg-indigo-600 border-indigo-500'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          claimType === 'warranty' ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        🛡️ Warranty Issue
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setClaimType('return')}
                      activeOpacity={0.7}
                      className={`flex-1 py-2.5 px-3 rounded-xl border items-center ${
                        claimType === 'return'
                          ? 'bg-indigo-600 border-indigo-500'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          claimType === 'return' ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        🔄 Return / Refund
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Issue Description Input */}
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Issue Description
                  </Text>
                  <TextInput
                    value={userReason}
                    onChangeText={setUserReason}
                    multiline
                    placeholder="e.g. Right earbud stopped charging, power button defective..."
                    placeholderTextColor="#64748b"
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-xs mb-3.5 min-h-[72px]"
                    textAlignVertical="top"
                  />

                  {/* Generate Button or Loading Indicator */}
                  {isGenerating ? (
                    <View className="py-3 items-center justify-center bg-slate-950 rounded-xl border border-slate-800 flex-row gap-2">
                      <ActivityIndicator size="small" color="#6366f1" />
                      <Text className="text-indigo-300 text-xs font-medium">
                        Drafting email with Gemini...
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleGenerateEmail}
                      activeOpacity={0.8}
                      className="bg-indigo-600 active:bg-indigo-700 py-3 rounded-xl items-center justify-center shadow"
                    >
                      <Text className="text-white font-semibold text-xs">
                        Generate Letter
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Drafted Email Output */}
                  {draftedEmail ? (
                    <View className="mt-4 pt-3.5 border-t border-slate-800">
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                          Drafted Letter
                        </Text>
                        <Text className="text-[10px] text-slate-500">Editable</Text>
                      </View>

                      <TextInput
                        value={draftedEmail}
                        onChangeText={setDraftedEmail}
                        multiline
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 text-xs leading-relaxed min-h-[150px] mb-3"
                        textAlignVertical="top"
                      />

                      <TouchableOpacity
                        onPress={handleCopyToClipboard}
                        activeOpacity={0.8}
                        className="bg-emerald-600/20 border border-emerald-500/40 active:bg-emerald-600/30 py-3 rounded-xl flex-row items-center justify-center gap-2"
                      >
                        <Ionicons
                          name={copied ? 'checkmark-circle' : 'copy-outline'}
                          size={16}
                          color="#34d399"
                        />
                        <Text className="text-emerald-300 font-semibold text-xs">
                          {copied ? '✓ Copied to Clipboard!' : '📋 Copy to Clipboard'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {/* Itemized Breakdown Table */}
            <View className="my-4">
              <Text className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Purchased Items
              </Text>

              <View className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80 mb-4">
                {receipt.items && receipt.items.length > 0 ? (
                  receipt.items.map((item: LineItem, index: number) => (
                    <View key={index} className="flex-row items-center justify-between p-3.5">
                      <View className="flex-1 pr-3">
                        <Text className="text-white text-sm font-medium" numberOfLines={2}>
                          {item.name}
                        </Text>
                        <Text className="text-slate-500 text-xs mt-0.5">
                          x{item.quantity}
                        </Text>
                      </View>
                      <Text className="text-slate-200 text-sm font-semibold">
                        {currencySymbol} {typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View className="p-4 items-center justify-center">
                    <Text className="text-slate-400 text-xs">No individual line items recorded</Text>
                  </View>
                )}
              </View>

              {/* Financial Summary */}
              <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-400 text-sm">Subtotal</Text>
                  <Text className="text-slate-200 text-sm font-medium">
                    {currencySymbol} {(Number(receipt.subtotal) || 0).toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-400 text-sm">Tax / VAT</Text>
                  <Text className="text-slate-200 text-sm font-medium">
                    {currencySymbol} {(Number(receipt.tax) || 0).toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center pt-3 border-t border-slate-800">
                  <Text className="text-white text-base font-bold">Grand Total</Text>
                  <Text className="text-xl font-bold text-emerald-400">
                    {currencySymbol} {(Number(receipt.total) || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Actions: Delete Receipt Button */}
            <View className="mt-4 mb-2">
              <TouchableOpacity
                onPress={handleDeletePress}
                activeOpacity={0.8}
                className="w-full border border-rose-500/40 bg-rose-500/10 active:bg-rose-500/20 py-3.5 rounded-xl flex-row items-center justify-center gap-2"
                accessibilityLabel="Delete Receipt"
              >
                <Ionicons name="trash-outline" size={18} color="#f43f5e" />
                <Text className="text-rose-400 font-semibold text-base">
                  Delete Receipt
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
