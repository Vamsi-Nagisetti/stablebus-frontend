import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearTokens } from '@/features/auth/tokenStorage';
const C={bg:'#F8F4ED',paper:'#FFFEFC',ink:'#382B28',muted:'#887A73',border:'#EAE0D7',burgundy:'#783D4A',light:'#F4EAEB',danger:'#A34444'};
export default function AccountSettingsScreen(){
 const router=useRouter(),insets=useSafeAreaInsets();
 const logout=()=>Alert.alert('Log out','Are you sure you want to log out?', [{text:'Cancel',style:'cancel'},{text:'Log out',style:'destructive',onPress:async()=>{await clearTokens();router.replace('/');}}]);
 const deletion=()=>Alert.alert('Account deletion unavailable','The current StableBus backend has a deletion-request service in its management layer, but no authenticated API endpoint is exposed for the mobile app. No deletion request has been submitted. Please contact support to request account deletion.');
 return <View style={[s.root,{paddingTop:insets.top}]}><View style={s.header}><Pressable style={s.icon} onPress={()=>router.back()}><Ionicons name="arrow-back" size={20} color={C.ink}/></Pressable><View><Text style={s.title}>Account settings</Text><Text style={s.sub}>Manage your StableBus account</Text></View></View>
 <ScrollView contentContainerStyle={{padding:18,paddingBottom:insets.bottom+24}}>
  <Text style={s.section}>ACCOUNT</Text>
  <Pressable style={s.row} onPress={logout}><View style={s.rowIcon}><Ionicons name="log-out-outline" size={20} color={C.burgundy}/></View><View style={{flex:1}}><Text style={s.label}>Log out</Text><Text style={s.desc}>Sign out of this device</Text></View><Ionicons name="chevron-forward" size={18} color={C.muted}/></Pressable>
  <Text style={[s.section,{marginTop:25}]}>DANGER ZONE</Text>
  <Pressable style={s.row} onPress={deletion}><View style={[s.rowIcon,{backgroundColor:'#F8EDEC'}]}><Ionicons name="trash-outline" size={20} color={C.danger}/></View><View style={{flex:1}}><Text style={[s.label,{color:C.danger}]}>Delete account</Text><Text style={s.desc}>Request permanent account deletion</Text></View><Ionicons name="chevron-forward" size={18} color={C.muted}/></Pressable>
  <Text style={s.foot}>Account deletion is not submitted from this screen because the current mobile API does not expose the deletion endpoint.</Text>
 </ScrollView></View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:C.bg},header:{padding:17,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:C.border},icon:{width:38,height:38,borderRadius:19,backgroundColor:C.paper,alignItems:'center',justifyContent:'center'},title:{fontSize:18,fontWeight:'700',color:C.ink},sub:{fontSize:11,color:C.muted,marginTop:3},section:{fontSize:10,fontWeight:'700',letterSpacing:1,color:C.muted,marginBottom:9},row:{minHeight:72,padding:13,backgroundColor:C.paper,borderWidth:1,borderColor:C.border,borderRadius:13,flexDirection:'row',alignItems:'center',gap:12},rowIcon:{width:39,height:39,borderRadius:12,backgroundColor:C.light,alignItems:'center',justifyContent:'center'},label:{fontSize:13,fontWeight:'700',color:C.ink},desc:{fontSize:10,color:C.muted,marginTop:4},foot:{fontSize:10,color:C.muted,lineHeight:16,marginTop:12}});
