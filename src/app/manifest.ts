import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest {
  return {id:'/',name:'Qarzhy — личные финансы',short_name:'Qarzhy',lang:'ru',start_url:'/',scope:'/',display:'standalone',background_color:'#08110f',theme_color:'#08110f',icons:[{src:'/icon-192.png?v=focus-1',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png?v=focus-1',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
}
