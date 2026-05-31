import React, { useState, useEffect } from "react";
import { 
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, 
  SafeAreaView, Platform, Dimensions 
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { getSavedCredentials, logout } from "./services/api";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import StatsScreen from "./screens/StatsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SupportScreen from "./screens/SupportScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// -----------------------------------------------------
// Layout Components
// -----------------------------------------------------
const Navbar = ({ storeName, navigation, onLogout }) => (
  <View style={styles.navbar}>
    <View style={styles.navLeft}>
      <Text style={styles.navBrand}>Auris</Text>
      <Text style={styles.navDivider}> / </Text>
      <Text style={styles.navStore}>{storeName}</Text>
    </View>
    <View style={styles.navRight}>
      <TouchableOpacity onPress={() => navigation.navigate("Support")}>
        <Text style={styles.navSupportLink}>Support</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onLogout} style={{ marginLeft: 16 }}>
        <Text style={{ fontSize: 16, color: '#888888' }}>⎋</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const CustomTabBar = ({ state, descriptors, navigation }) => {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        
        // Hide tab bar if we are not on one of the 3 main tabs
        if (!['Home', 'Stats', 'Settings'].includes(route.name)) return null;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity 
            key={route.key} 
            onPress={onPress} 
            style={[styles.tabItem, isFocused && styles.tabItemActive]}
            activeOpacity={1}
          >
            <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>
              {route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// -----------------------------------------------------
// App Shell
// -----------------------------------------------------
function MainTabs({ store, onLogout }) {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" children={(props) => <HomeScreen {...props} store={store} />} />
      <Tab.Screen name="Stats" children={(props) => <StatsScreen {...props} store={store} />} />
      <Tab.Screen name="Settings" children={(props) => <SettingsScreen {...props} store={store} onLogout={onLogout} />} />
      {/* Support is technically a tab but hidden from tab bar */}
      <Tab.Screen name="Support" children={(props) => <SupportScreen {...props} />} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [store, setStore] = useState({
    store_id: 'home_test_2',
    store_name: 'Home Test 2',
    password: 'auris123'
  });

  const handleLogout = async () => {
    // No-op since there's no login screen
  };

  if (!store) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <NavigationContainer>
        {/* Persistent Navbar for authenticated shell */}
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="AppTabs">
            {(props) => (
              <View style={{ flex: 1, backgroundColor: "#F9F9F9" }}>
                <Navbar storeName={store.store_name || store.store_id} navigation={props.navigation} onLogout={handleLogout} />
                <MainTabs store={store} onLogout={handleLogout} />
              </View>
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF", paddingTop: Platform.OS === "android" ? 25 : 0 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9F9F9" },
  
  navbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    height: 52,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: "#EFEFEF",
    zIndex: 10,
  },
  navLeft: { flexDirection: "row", alignItems: "center" },
  navBrand: { fontSize: 18, fontWeight: "700", color: "#111111" },
  navDivider: { fontSize: 18, fontWeight: "400", color: "#888888" },
  navStore: { fontSize: 18, fontWeight: "400", color: "#888888" },
  navRight: { flexDirection: "row", alignItems: "center" },
  navSupportLink: { fontSize: 13, color: "#888888", fontWeight: "500" },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    height: 40,
    borderBottomWidth: 1,
    borderColor: "#EFEFEF",
  },
  tabItem: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: "#111111",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tabTextActive: {
    color: "#111111",
  }
});
