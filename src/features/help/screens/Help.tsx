import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const C={bg:'#F8F4ED',paper:'#FFFEFC',ink:'#382B28',muted:'#887A73',border:'#EAE0D7',burgundy:'#783D4A',light:'#F4EAEB'};
const SUPPORT_PHONE=''; // Add the official StableBus support number before release.
const SUPPORT_EMAIL=''; // Add the official StableBus support email before release.
export default function HelpScreen(){
 const router=useRouter(),insets=useSafeAreaInsets();
 const call=()=>SUPPORT_PHONE?Linking.openURL(`tel:${SUPPORT_PHONE}`):Alert.alert('Support number unavailable','Add the official StableBus support number before publishing the app.');
 const email=()=>SUPPORT_EMAIL?Linking.openURL(`mailto:${SUPPORT_EMAIL}`):Alert.alert('Support email unavailable','Add the official StableBus support email before publishing the app.');
 return <View style={s.root}>
  <Pressable style={s.scrim} onPress={()=>router.back()}/>
  <View style={[s.sheet,{paddingBottom:insets.bottom+22}]}>
   <View style={s.handle}/>
   <View style={s.head}><View style={{flex:1}}><Text style={s.title}>Help & support</Text><Text style={s.sub}>We're here to help with your journey</Text></View><Pressable onPress={()=>router.back()}><Ionicons name="close" size={23} color={C.ink}/></Pressable></View>
   <Pressable style={s.row} onPress={call}><View style={s.icon}><Ionicons name="call-outline" size={20} color={C.burgundy}/></View><View style={{flex:1}}><Text style={s.label}>Call us</Text><Text style={s.value}>{SUPPORT_PHONE||'Support number to be configured'}</Text></View><Ionicons name="chevron-forward" size={18} color={C.muted}/></Pressable>
   <Pressable style={s.row} onPress={email}><View style={s.icon}><Ionicons name="mail-outline" size={20} color={C.burgundy}/></View><View style={{flex:1}}><Text style={s.label}>Email us</Text><Text style={s.value}>{SUPPORT_EMAIL||'Support email to be configured'}</Text></View><Ionicons name="chevron-forward" size={18} color={C.muted}/></Pressable>
   <Text style={s.note}>Please keep your booking reference handy when contacting support.</Text>
  </View>
 </View>;
}
const s=StyleSheet.create({root:{flex:1,justifyContent:'flex-end',backgroundColor:'transparent'},scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(40,30,28,0.38)'},sheet:{backgroundColor:C.paper,borderTopLeftRadius:23,borderTopRightRadius:23,paddingHorizontal:21,paddingTop:10},handle:{width:38,height:4,borderRadius:4,backgroundColor:C.border,alignSelf:'center',marginBottom:18},head:{flexDirection:'row',alignItems:'center',marginBottom:17},title:{fontSize:18,fontWeight:'700',color:C.ink},sub:{fontSize:11,color:C.muted,marginTop:4},row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:68,borderTopWidth:1,borderTopColor:C.border},icon:{width:40,height:40,borderRadius:12,backgroundColor:C.light,alignItems:'center',justifyContent:'center'},label:{fontSize:13,fontWeight:'700',color:C.ink},value:{fontSize:11,color:C.muted,marginTop:4},note:{fontSize:10,color:C.muted,lineHeight:16,marginTop:13}});
