import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const C={bg:'#F8F4ED',paper:'#FFFEFC',ink:'#382B28',muted:'#887A73',border:'#EAE0D7',burgundy:'#783D4A',light:'#F4EAEB'};
export default function NotificationsScreen(){
 const router=useRouter(),insets=useSafeAreaInsets();
 return <View style={[s.root,{paddingTop:insets.top}]}><View style={s.header}><Pressable style={s.icon} onPress={()=>router.back()}><Ionicons name="arrow-back" size={20} color={C.ink}/></Pressable><View><Text style={s.title}>Notifications</Text><Text style={s.sub}>Stay informed about your journeys</Text></View></View>
 <View style={s.card}><View style={s.iconBig}><Ionicons name="notifications-outline" size={22} color={C.burgundy}/></View><View style={{flex:1}}><Text style={s.label}>Push notifications</Text><Text style={s.desc}>Manage notification permission for StableBus on this device.</Text></View></View>
 <Pressable style={s.settings} onPress={()=>Linking.openSettings()}><Text style={s.settingsText}>Open device settings</Text><Ionicons name="open-outline" size={16} color={C.burgundy}/></Pressable>
 <Text style={s.note}>Booking and service notifications depend on device permission and server-side push delivery. Device registration and preference APIs are not currently exposed by the StableBus backend.</Text>
 </View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:C.bg},header:{padding:17,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:C.border},icon:{width:38,height:38,borderRadius:19,backgroundColor:C.paper,alignItems:'center',justifyContent:'center'},title:{fontSize:18,fontWeight:'700',color:C.ink},sub:{fontSize:11,color:C.muted,marginTop:3},card:{margin:18,padding:15,backgroundColor:C.paper,borderRadius:15,borderWidth:1,borderColor:C.border,flexDirection:'row',alignItems:'center',gap:12},iconBig:{width:42,height:42,borderRadius:13,backgroundColor:C.light,alignItems:'center',justifyContent:'center'},label:{fontSize:13,fontWeight:'700',color:C.ink},desc:{fontSize:10,color:C.muted,lineHeight:15,marginTop:4},settings:{marginHorizontal:18,padding:14,flexDirection:'row',justifyContent:'space-between',backgroundColor:C.paper,borderRadius:12},settingsText:{fontSize:12,fontWeight:'600',color:C.burgundy},note:{marginHorizontal:22,marginTop:13,fontSize:10,color:C.muted,lineHeight:16}});
