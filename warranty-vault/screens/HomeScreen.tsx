import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ListRenderItem,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StoredReceipt, ReceiptCategory } from '../types/receipt';
import { getAllReceipts, deleteReceipt } from '../services/database';
import ReceiptDetailModal from '../components/ReceiptDetailModal';

interface HomeScreenProps {
  onScanPress: () => void;
}

// Category badge color mapping
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

function getCountdownStatus(receipt: StoredReceipt): {
  days: number;
  label: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
} {
  const warrantyDays = getDaysRemaining(receipt.warrantyDeadline);
  const returnDays = getDaysRemaining(receipt.returnDeadline);

  // If warranty deadline is defined, use warranty countdown as primary indicator
  // otherwise fallback to return window deadline
  let relevantDays: number;
  let typeLabel: string;

  if (warrantyDays !== null) {
    relevantDays = warrantyDays;
    typeLabel = 'Warranty';
  } else if (returnDays !== null) {
    relevantDays = returnDays;
    typeLabel = 'Return';
  } else {
    relevantDays = 0;
    typeLabel = 'Coverage';
  }

  if (relevantDays <= 0) {
    return {
      days: relevantDays,
      label: `${typeLabel} Expired`,
      pillBg: 'bg-rose-500/15',
      pillText: 'text-rose-400',
      pillBorder: 'border-rose-500/30',
    };
  }

  if (relevantDays <= 30) {
    return {
      days: relevantDays,
      label: `${relevantDays}d left (${typeLabel})`,
      pillBg: 'bg-amber-500/15',
      pillText: 'text-amber-400',
      pillBorder: 'border-amber-500/30',
    };
  }

  return {
    days: relevantDays,
    label: `${relevantDays}d left (${typeLabel})`,
    pillBg: 'bg-emerald-500/15',
    pillText: 'text-emerald-400',
    pillBorder: 'border-emerald-500/30',
  };
}

export default function HomeScreen({ onScanPress }: HomeScreenProps) {
  const [receipts, setReceipts] = useState<StoredReceipt[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<StoredReceipt | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const CATEGORY_CHIPS = [
    'All',
    'Expiring Soon',
    'Electronics',
    'Groceries',
    'Apparel',
    'Home',
    'Other',
  ] as const;

  const loadReceipts = useCallback(() => {
    try {
      const data = getAllReceipts();
      setReceipts(data);
    } catch (error) {
      console.error('Failed to load receipts:', error);
    }
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    try {
      loadReceipts();
    } finally {
      setRefreshing(false);
    }
  }, [loadReceipts]);

  const handleDelete = (receipt: StoredReceipt) => {
    Alert.alert(
      'Delete Receipt',
      `Are you sure you want to remove the receipt for "${receipt.storeName}" from your vault?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              deleteReceipt(receipt.id);
              loadReceipts();
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Could not delete receipt.';
              Alert.alert('Error', message);
            }
          },
        },
      ]
    );
  };

  // Metrics calculations
  const totalCount = receipts.length;

  const expiringCount = receipts.filter((r) => {
    const wDays = getDaysRemaining(r.warrantyDeadline);
    const rDays = getDaysRemaining(r.returnDeadline);
    return (wDays !== null && wDays > 0 && wDays <= 30) || (rDays !== null && rDays > 0 && rDays <= 30);
  }).length;

  const totalProtectedValue = receipts.reduce((sum, r) => sum + (Number(r.total) || 0), 0);

  // Check for immediate urgency (< 14 days)
  const urgentReceipts = receipts
    .map((r) => {
      const wDays = getDaysRemaining(r.warrantyDeadline);
      const rDays = getDaysRemaining(r.returnDeadline);
      const minDays = Math.min(
        wDays !== null && wDays > 0 ? wDays : Infinity,
        rDays !== null && rDays > 0 ? rDays : Infinity
      );
      return { receipt: r, days: minDays };
    })
    .filter((item) => item.days <= 14 && item.days !== Infinity)
    .sort((a, b) => a.days - b.days);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      // Category filter
      if (selectedCategory === 'Expiring Soon') {
        const wDays = getDaysRemaining(receipt.warrantyDeadline);
        const rDays = getDaysRemaining(receipt.returnDeadline);
        const isExpiring =
          (wDays !== null && wDays > 0 && wDays <= 30) ||
          (rDays !== null && rDays > 0 && rDays <= 30);
        if (!isExpiring) return false;
      } else if (selectedCategory !== 'All') {
        if (receipt.category !== selectedCategory) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const storeMatch = receipt.storeName.toLowerCase().includes(query);
        const itemsMatch =
          receipt.items &&
          receipt.items.some((item) => item.name.toLowerCase().includes(query));
        if (!storeMatch && !itemsMatch) {
          return false;
        }
      }

      return true;
    });
  }, [receipts, selectedCategory, searchQuery]);

  const renderReceiptItem: ListRenderItem<StoredReceipt> = ({ item }) => {
    const countdown = getCountdownStatus(item);
    const categoryStyle = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedReceipt(item)}
        className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 mb-3.5 shadow-sm"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
              <Text className="text-base font-semibold text-white tracking-tight" numberOfLines={1}>
                {item.storeName}
              </Text>
              <View
                className={`px-2.5 py-0.5 rounded-full border ${categoryStyle.bg} ${categoryStyle.border}`}
              >
                <Text className={`text-[11px] font-semibold ${categoryStyle.text}`}>
                  {item.category}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-3 mt-1">
              <Text className="text-xs text-slate-400">
                Purchased: <Text className="text-slate-300 font-medium">{item.purchaseDate}</Text>
              </Text>
              <Text className="text-xs text-slate-400">
                Total:{' '}
                <Text className="text-white font-bold">
                  {item.currency || 'Rs'} {item.total.toFixed(2)}
                </Text>
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="p-2 rounded-lg bg-slate-800/70 active:bg-rose-950/40 border border-slate-700/50"
            accessibilityLabel={`Delete receipt from ${item.storeName}`}
          >
            <Ionicons name="trash-outline" size={16} color="#f43f5e" />
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center justify-between mt-3.5 pt-3 border-t border-slate-800/60">
          <View
            className={`px-2.5 py-1 rounded-full border ${countdown.pillBg} ${countdown.pillBorder}`}
          >
            <Text className={`text-xs font-semibold ${countdown.pillText}`}>
              ● {countdown.label}
            </Text>
          </View>

          {item.warrantyMonths > 0 ? (
            <Text className="text-[11px] text-slate-400">
              Warranty: <Text className="text-slate-300">{item.warrantyMonths} mos</Text>
            </Text>
          ) : (
            <Text className="text-[11px] text-slate-400">
              Return: <Text className="text-slate-300">{item.returnWindowDays} days</Text>
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View className="mb-4">
      {/* Header Top Section */}
      <View className="flex-row items-center justify-between mt-3 mb-6">
        <View>
          <Text className="text-2xl font-bold text-white tracking-tight">Warranty Vault</Text>
          <Text className="text-xs text-slate-400 mt-0.5">Local receipts & coverage auditor</Text>
        </View>

        <View className="bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
          <Text className="text-indigo-400 text-xs font-semibold">
            {totalCount} Active {totalCount === 1 ? 'Warranty' : 'Warranties'}
          </Text>
        </View>
      </View>

      {/* Metrics Overview Grid (3 Cards) */}
      <View className="flex-row gap-2.5 mb-5">
        {/* Card 1: Total Stored */}
        <View className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 justify-between">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Stored
            </Text>
            <Ionicons name="receipt-outline" size={15} color="#94a3b8" />
          </View>
          <Text className="text-xl font-bold text-white">{totalCount}</Text>
          <Text className="text-[10px] text-slate-400 mt-0.5">Total receipts</Text>
        </View>

        {/* Card 2: Expiring Soon (< 30 days) */}
        <View className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 justify-between">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Expiring
            </Text>
            <Ionicons
              name="time-outline"
              size={15}
              color={expiringCount > 0 ? '#fbbf24' : '#94a3b8'}
            />
          </View>
          <View className="flex-row items-baseline gap-1.5">
            <Text
              className={`text-xl font-bold ${
                expiringCount > 0 ? 'text-amber-400' : 'text-white'
              }`}
            >
              {expiringCount}
            </Text>
            {expiringCount > 0 && (
              <View className="bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                <Text className="text-[9px] font-bold text-amber-300">&lt;30d</Text>
              </View>
            )}
          </View>
          <Text className="text-[10px] text-slate-400 mt-0.5">&lt; 30 days left</Text>
        </View>

        {/* Card 3: Total Protected Value */}
        <View className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 justify-between">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Protected
            </Text>
            <Ionicons name="shield-checkmark-outline" size={15} color="#34d399" />
          </View>
          <Text className="text-xl font-bold text-white" numberOfLines={1}>
            Rs {totalProtectedValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
          <Text className="text-[10px] text-slate-400 mt-0.5">Summed value</Text>
        </View>
      </View>

      {/* "Expiring Soon" Urgency Banner (<= 14 days) */}
      {urgentReceipts.length > 0 && (
        <View className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-5 shadow-sm">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Ionicons name="warning-outline" size={18} color="#f59e0b" />
            <Text className="text-amber-300 font-bold text-sm">Action Needed Soon</Text>
          </View>
          <Text className="text-slate-300 text-xs leading-relaxed">
            Coverage for <Text className="font-semibold text-white">{urgentReceipts[0].receipt.storeName}</Text> expires in{' '}
            <Text className="font-bold text-amber-400">{urgentReceipts[0].days} day{urgentReceipts[0].days === 1 ? '' : 's'}</Text>.
            {urgentReceipts.length > 1 &&
              ` (+${urgentReceipts.length - 1} other purchase${
                urgentReceipts.length > 2 ? 's' : ''
              } expiring soon)`}
          </Text>
        </View>
      )}

      {/* Search Bar & Category Filter Chips */}
      <View className="mb-5">
        <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <Ionicons name="search-outline" size={18} color="#64748b" style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search store, items..."
            placeholderTextColor="#64748b"
            className="flex-1 text-white text-sm p-0 placeholder-slate-500"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {CATEGORY_CHIPS.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
                className={`px-3.5 py-2 rounded-xl border ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-500'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Text
                  className={`text-xs ${
                    isActive ? 'text-white font-medium' : 'text-slate-400'
                  }`}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Receipts Section Header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Recent Receipts ({filteredReceipts.length})
        </Text>
        {receipts.length > 0 && (
          <Text className="text-xs text-slate-400">Pull to refresh</Text>
        )}
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (receipts.length > 0) {
      return (
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-8 items-center justify-center my-6 shadow-md">
          <View className="w-16 h-16 rounded-full bg-slate-800/80 items-center justify-center mb-4 border border-slate-700/60">
            <Ionicons name="search-outline" size={30} color="#94a3b8" />
          </View>
          <Text className="text-lg font-bold text-white text-center mb-2">
            No matching receipts
          </Text>
          <Text className="text-slate-400 text-xs text-center max-w-xs leading-relaxed mb-4">
            Try adjusting your search terms or filter criteria.
          </Text>
          {(searchQuery || selectedCategory !== 'All') && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              activeOpacity={0.8}
              className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex-row items-center gap-1.5"
            >
              <Ionicons name="refresh-outline" size={16} color="#cbd5e1" />
              <Text className="text-slate-300 font-semibold text-xs">Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View className="bg-slate-900 border border-slate-800 rounded-3xl p-8 items-center justify-center my-6 shadow-md">
        <View className="w-16 h-16 rounded-full bg-slate-800/80 items-center justify-center mb-4 border border-slate-700/60">
          <Ionicons name="document-text-outline" size={30} color="#94a3b8" />
        </View>
        <Text className="text-lg font-bold text-white text-center mb-2">
          No receipts scanned yet
        </Text>
        <Text className="text-slate-400 text-xs text-center max-w-xs leading-relaxed mb-6">
          Tap the button below to audit your first purchase and automatically track returns & warranties with Gemini AI.
        </Text>
        <TouchableOpacity
          onPress={onScanPress}
          activeOpacity={0.8}
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-5 py-3 rounded-xl flex-row items-center gap-2 shadow-lg"
        >
          <Ionicons name="camera-outline" size={18} color="#ffffff" />
          <Text className="text-white font-semibold text-sm">Scan First Receipt</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-950 px-4">
      <FlatList
        data={filteredReceipts}
        keyExtractor={(item) => item.id}
        renderItem={renderReceiptItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
            colors={['#6366f1']}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button (FAB) */}
      <View className="absolute bottom-6 right-5 left-5 items-end pointer-events-box-none">
        <TouchableOpacity
          onPress={onScanPress}
          activeOpacity={0.85}
          className="bg-indigo-600 active:bg-indigo-700 px-6 py-4 rounded-full shadow-2xl flex-row items-center gap-2.5 border border-indigo-400/30"
          style={{ elevation: 8 }}
        >
          <Ionicons name="add" size={20} color="#ffffff" />
          <Text className="text-white font-bold text-base tracking-wide">
            Scan Receipt
          </Text>
        </TouchableOpacity>
      </View>

      {/* Receipt Detail Modal */}
      <ReceiptDetailModal
        receipt={selectedReceipt}
        visible={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        onDelete={(id) => {
          deleteReceipt(id);
          setSelectedReceipt(null);
          loadReceipts();
        }}
      />
    </View>
  );
}
