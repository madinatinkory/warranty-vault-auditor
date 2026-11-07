import './global.css';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './screens/HomeScreen';
import ScanReceiptScreen from './screens/ScanReceiptScreen';
import { initDatabase } from './services/database';
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { styled } from "nativewind";

const SafeAreaView = styled(RNSafeAreaView);

export default function App() {
  const [isScanModalVisible, setIsScanModalVisible] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    try {
      initDatabase();
    } catch (error) {
      console.error('Failed to initialize database on app launch:', error);
    }
  }, []);

  const handleOpenScan = () => {
    setIsScanModalVisible(true);
  };

  const handleCloseScan = () => {
    setIsScanModalVisible(false);
  };

  const handleScanSaved = () => {
    setIsScanModalVisible(false);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-slate-950" edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <HomeScreen key={refreshKey} onScanPress={handleOpenScan} />

        {/* Scan Receipt Modal */}
        <Modal
          visible={isScanModalVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={handleCloseScan}
        >
          <SafeAreaView className="flex-1 bg-slate-950" edges={['top', 'left', 'right', 'bottom']}>
            <StatusBar style="light" />
            <ScanReceiptScreen onSaved={handleScanSaved} onClose={handleCloseScan} />
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
