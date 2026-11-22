import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C={bg:'#F8F4ED',paper:'#FFFEFC',ink:'#382B28',muted:'#887A73',border:'#EAE0D7',burgundy:'#783D4A'};
export default function LegalPage({title,sections}:{title:string;sections:{heading:string;body:string}[]}){
 const router=useRouter(),insets=useSafeAreaInsets();
 return <View style={[s.root,{paddingTop:insets.top}]}><View style={s.header}><Pressable style={s.back} onPress={()=>router.back()}><Ionicons name="arrow-back" size={20} color={C.ink}/></Pressable><Text style={s.title}>{title}</Text></View><ScrollView contentContainerStyle={{padding:20,paddingBottom:insets.bottom+30}}><Text style={s.updated}>StableBus · Draft for publication · 22 November 2026</Text><Text style={s.intro}>Please read this document carefully. These draft terms describe the intended use of the StableBus mobile application and services. They must be reviewed and approved by qualified Indian legal counsel before publication.</Text>{sections.map((item,i)=><View key={i} style={s.section}><Text style={s.heading}>{item.heading}</Text><Text style={s.body}>{item.body}</Text></View>)}<Text style={s.disclaimer}>This is a product-content draft, not legal advice. It is not a substitute for review under applicable Indian laws, regulations, consumer-protection requirements, payment rules and data-protection requirements.</Text></ScrollView></View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:C.bg},header:{padding:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:C.border},back:{width:36,height:36,borderRadius:18,backgroundColor:C.paper,alignItems:'center',justifyContent:'center'},title:{fontSize:17,fontWeight:'700',color:C.ink},updated:{fontSize:10,color:C.muted,marginBottom:12},intro:{fontSize:12,lineHeight:19,color:C.ink,backgroundColor:C.paper,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border},section:{marginTop:20},heading:{fontSize:13,fontWeight:'700',color:C.burgundy,marginBottom:7},body:{fontSize:11,lineHeight:18,color:C.ink},disclaimer:{fontSize:10,lineHeight:16,color:C.muted,marginTop:25,paddingTop:15,borderTopWidth:1,borderColor:C.border}});
