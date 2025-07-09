import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AdminCalendarScreen = () => {
  const { authState: { user }, loading: authLoading, setAuth } = useAuth();
  const [selectedTab, setSelectedTab] = useState('reservations');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reservations, setReservations] = useState([]);
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMonthly, setIsMonthly] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      const reloadAuth = async () => {
        const storedAuth = await AsyncStorage.getItem('auth');
        if (storedAuth) {
          const parsedAuth = JSON.parse(storedAuth);
          if (parsedAuth.user?._id) {
            setAuth(parsedAuth, true);
          }
        }
      };
      reloadAuth();
    }
  }, [authLoading, user, setAuth]);

  const fetchReservations = useCallback(async () => {
    if (!user?._id) {
      console.log('User _id not available, please log in');
      return;
    }
    setIsLoading(true);
    try {
      console.log(`Fetching reservations for user ${user._id} on date ${selectedDate}`);
      
      // Essayons plusieurs formats d'endpoint
      let res;
      try {
        // Format 1: endpoint actuel
        res = await api.get(`/reservations/personnel/${user._id}?date=${selectedDate}`);
      } catch (error1) {
        console.log('Format 1 failed, trying format 2...');
        try {
          // Format 2: endpoint alternatif
          res = await api.get(`/reservations/user/${user._id}?date=${selectedDate}`);
        } catch (error2) {
          console.log('Format 2 failed, trying format 3...');
          try {
            // Format 3: endpoint pour toutes les réservations
            res = await api.get(`/reservations?personnel=${user._id}&date=${selectedDate}`);
          } catch (error3) {
            console.log('Format 3 failed, trying format 4...');
            // Format 4: endpoint général avec filtrage
            res = await api.get(`/reservations?date=${selectedDate}`);
          }
        }
      }
      
      console.log('API response for reservations:', res.data);
      
      // Filtrer les réservations par personnel si nécessaire
      let filteredReservations = res.data;
      if (Array.isArray(res.data)) {
        filteredReservations = res.data.filter(reservation => 
          reservation.personnel === user._id || 
          reservation.personnel?._id === user._id
        );
      }
      
      console.log('Filtered reservations:', filteredReservations);
      setReservations(filteredReservations);
    } catch (error) {
      console.log('Error fetching reservations:', error.response?.data || error.message);
      setReservations([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?._id, selectedDate]);

  const fetchBlockedSlots = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      console.log(`Fetching blocked slots for date ${selectedDate}`);
      const res = await api.get(`/reservations/blocked/day?date=${selectedDate}`);
      console.log('Raw API response for blocked slots:', res.data);
      
      // FIX 1: Améliorer le parsing des slots bloqués
      const formattedSlots = res.data.map(slot => {
        const date = new Date(slot.date);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        // Format correctly with leading zeros
        const formattedHours = hours.toString().padStart(2, '0');
        const formattedMinutes = minutes.toString().padStart(2, '0');
        return `${formattedHours}:${formattedMinutes}`;
      });
      
      setBlockedSlots(formattedSlots);
    } catch (error) {
      console.log('Error fetching blocked slots:', error.response?.data || error.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!authLoading && user) {
      if (selectedTab === 'reservations') {
        fetchReservations();
      } else if (selectedTab === 'blockSlots') {
        fetchBlockedSlots();
      }
    }
  }, [selectedTab, selectedDate, authLoading, user, fetchReservations, fetchBlockedSlots]);

  const BlockSlotScreen = () => {
    const blockSlot = async (time) => {
      if (!user) {
        console.log('No user authenticated');
        return;
      }
      setIsLoading(true);
      try {
        const [hours, minutes] = time.split(':').map(Number);
        const startDate = new Date(selectedDate);
        startDate.setHours(hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + 30 * 60000);

        const payload = {
          date: startDate.toISOString(),
          time,
          isMonthly,
          isAdminBlock: user.role === 'admin',
          personnel: user.role === 'admin' ? null : user._id,
        };
        console.log('Blocking slot with payload:', payload);
        await api.post('/reservations/block', payload);
        // Refetch immediately after successful block
        await fetchBlockedSlots();
      } catch (error) {
        console.log('Error blocking slot:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const unblockSlot = async (time) => {
      setIsLoading(true);
      try {
        const [hours, minutes] = time.split(':').map(Number);
        const startDate = new Date(selectedDate);
        startDate.setUTC(hours, minutes, 0, 0);

        const payload = { date: startDate.toISOString(), time };
        console.log('Unblocking slot with payload:', payload);
        await api.delete('/reservations/block', { data: payload });
        // Refetch immediately after successful unblock
        await fetchBlockedSlots();
      } catch (error) {
        console.log('Error unblocking slot:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // FIX 2: Améliorer la génération des créneaux horaires
    const generateTimeSlots = () => {
      const slots = [];
      const startHour = 9;
      const endHour = 18;
      
      for (let hour = startHour; hour < endHour; hour++) {
        // Format with leading zero for consistency
        const formattedHour = hour.toString().padStart(2, '0');
        slots.push(`${formattedHour}:00`);
        slots.push(`${formattedHour}:30`);
      }
      return slots;
    };

    const renderItem = ({ item }) => (
      <View style={styles.slotContainer}>
        <Text style={styles.slotText}>{item}</Text>
        {blockedSlots.includes(item) ? (
          <TouchableOpacity 
            style={styles.unblockButton} 
            onPress={() => unblockSlot(item)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Unblock</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.blockButton} 
            onPress={() => blockSlot(item)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Block</Text>
          </TouchableOpacity>
        )}
      </View>
    );

    return (
      <View style={styles.screenContainer}>
        <View style={styles.header}>
          <Text style={styles.sectionTitle}>Block Slots</Text>
          <TouchableOpacity 
            style={styles.toggleButton} 
            onPress={() => setIsMonthly(!isMonthly)}
            disabled={isLoading}
          >
            <Text style={styles.toggleText}>
              {isMonthly ? 'Switch to Day' : 'Switch to Month'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <Calendar
          onDayPress={(day) => {
            setSelectedDate(day.dateString);
          }}
          markedDates={{ 
            [selectedDate]: { 
              selected: true, 
              selectedColor: '#C0C0C0' 
            } 
          }}
          style={styles.calendar}
          theme={{
            backgroundColor: '#2F3A3C',
            calendarBackground: '#2F3A3C',
            textSectionTitleColor: '#C0C0C0',
            selectedDayBackgroundColor: '#C0C0C0',
            selectedDayTextColor: '#FFFFFF',
            todayTextColor: '#D3D3D3',
            dayTextColor: '#D3D3D3',
            textDisabledColor: '#A9A9A9',
            dotColor: '#C0C0C0',
            selectedDotColor: '#FFFFFF',
            arrowColor: '#C0C0C0',
            monthTextColor: '#C0C0C0',
            textDayFontWeight: '400',
            textMonthFontWeight: '600',
            textDayHeaderFontWeight: '500',
          }}
        />

        {/* FIX 3: Utiliser une FlatList avec une hauteur fixe et style optimisé */}
        <FlatList
          data={generateTimeSlots()}
          renderItem={renderItem}
          keyExtractor={(item) => item}
          style={styles.slotList}
          contentContainerStyle={styles.slotListContent}
          showsVerticalScrollIndicator={true}
          getItemLayout={(data, index) => ({
            length: 60, // hauteur fixe par item
            offset: 60 * index,
            index,
          })}
          removeClippedSubviews={false}
        />
        
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#C0C0C0" />
          </View>
        )}
      </View>
    );
  };

  const ReservationScreen = () => {
    // FIX 4: Améliorer le format des dates de réservation
    const formatReservationTime = (startDate, endDate) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const startTime = start.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      const endTime = end.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      return `${startTime} - ${endTime}`;
    };

    const renderItem = ({ item }) => (
      <View style={styles.reservationContainer}>
        <Text style={styles.reservationTime}>
          {formatReservationTime(item.date, item.endTime)}
        </Text>
        <Text style={styles.reservationDetails}>
          Service: {item.service?.name || 'N/A'}
        </Text>
        <Text style={styles.reservationDetails}>
          Client: {(item.client?.firstName || '') + ' ' + (item.client?.lastName || '').trim() || 'N/A'}
        </Text>
      </View>
    );

    // FIX 5: Marquer les dates avec réservations sur le calendrier
    const getMarkedDates = () => {
      const marked = { 
        [selectedDate]: { 
          selected: true, 
          selectedColor: '#C0C0C0' 
        } 
      };
      
      // Marquer les dates avec réservations
      reservations.forEach(reservation => {
        const date = new Date(reservation.date).toISOString().split('T')[0];
        if (date !== selectedDate) {
          marked[date] = { 
            marked: true, 
            dotColor: '#4CAF50' 
          };
        }
      });
      
      return marked;
    };

    return (
      <View style={styles.screenContainer}>
        <View style={styles.header}>
          <Text style={styles.sectionTitle}>Reservations</Text>
          <Text style={styles.dateText}>{selectedDate}</Text>
        </View>
        
        <Calendar
          onDayPress={(day) => {
            setSelectedDate(day.dateString);
          }}
          markedDates={getMarkedDates()}
          style={styles.calendar}
          theme={{
            backgroundColor: '#2F3A3C',
            calendarBackground: '#2F3A3C',
            textSectionTitleColor: '#C0C0C0',
            selectedDayBackgroundColor: '#C0C0C0',
            selectedDayTextColor: '#FFFFFF',
            todayTextColor: '#D3D3D3',
            dayTextColor: '#D3D3D3',
            textDisabledColor: '#A9A9A9',
            dotColor: '#4CAF50',
            selectedDotColor: '#FFFFFF',
            arrowColor: '#C0C0C0',
            monthTextColor: '#C0C0C0',
            textDayFontWeight: '400',
            textMonthFontWeight: '600',
            textDayHeaderFontWeight: '500',
          }}
        />

        <FlatList
          data={reservations}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          style={styles.reservationList}
          contentContainerStyle={styles.reservationListContent}
          ListEmptyComponent={
            !isLoading ? (
              <Text style={styles.emptyText}>
                No reservations found for {selectedDate}
              </Text>
            ) : null
          }
          showsVerticalScrollIndicator={true}
        />
        
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#C0C0C0" />
          </View>
        )}
      </View>
    );
  };

  const renderScreen = () => {
    if (authLoading) {
      return (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#C0C0C0" />
        </View>
      );
    }
    if (!user) {
      return (
        <View style={styles.centerMessage}>
          <Text style={styles.errorText}>Please log in to access this screen.</Text>
        </View>
      );
    }
    switch (selectedTab) {
      case 'reservations':
        return <ReservationScreen />;
      case 'blockSlots':
        return <BlockSlotScreen />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'reservations' && styles.selectedTab]}
          onPress={() => setSelectedTab('reservations')}
          disabled={authLoading || !user}
        >
          <Text style={[styles.tabText, selectedTab === 'reservations' && styles.selectedTabText]}>
            Reservations
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'blockSlots' && styles.selectedTab]}
          onPress={() => setSelectedTab('blockSlots')}
          disabled={authLoading || !user}
        >
          <Text style={[styles.tabText, selectedTab === 'blockSlots' && styles.selectedTabText]}>
            Block Slots
          </Text>
        </TouchableOpacity>
      </View>
      {renderScreen()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C2526',
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#2F3A3C',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#C0C0C0',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 15,
  },
  selectedTab: {
    backgroundColor: '#C0C0C0',
  },
  tabText: {
    color: '#D3D3D3',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedTabText: {
    color: '#1C2526',
  },
  screenContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#2F3A3C',
    borderBottomWidth: 1,
    borderBottomColor: '#C0C0C0',
  },
  sectionTitle: {
    color: '#C0C0C0',
    fontSize: 20,
    fontWeight: '700',
  },
  dateText: {
    color: '#D3D3D3',
    fontSize: 16,
  },
  calendar: {
    borderRadius: 10,
    margin: 10,
    marginBottom: 5,
  },
  // Styles pour les réservations
  reservationList: {
    flex: 1,
    marginTop: 10,
  },
  reservationListContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  reservationContainer: {
    padding: 15,
    marginVertical: 5,
    backgroundColor: '#2F3A3C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C0C0C0',
  },
  reservationTime: {
    color: '#C0C0C0',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  reservationDetails: {
    color: '#D3D3D3',
    fontSize: 14,
    marginBottom: 3,
  },
  // Styles pour les créneaux bloqués
  slotList: {
    flex: 1,
    marginTop: 10,
  },
  slotListContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  slotContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginVertical: 3,
    backgroundColor: '#2F3A3C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C0C0C0',
    height: 60,
  },
  slotText: {
    color: '#D3D3D3',
    fontSize: 16,
    fontWeight: '500',
  },
  blockButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  unblockButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#C0C0C0',
    borderRadius: 10,
  },
  toggleText: {
    color: '#1C2526',
    fontSize: 14,
    fontWeight: '600',
  },
  // Styles pour les états de chargement et d'erreur
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: '#D3D3D3',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
    fontStyle: 'italic',
  },
});

export default AdminCalendarScreen;