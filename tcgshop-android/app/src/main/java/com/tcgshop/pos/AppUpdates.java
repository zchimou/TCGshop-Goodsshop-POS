package com.tcgshop.pos;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.provider.Settings;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Silent startup check; only a confirmed newer release opens the mandatory update dialog. */
final class AppUpdates {
    static final String ENDPOINT="https://pos.example.com/tcgshop/api/update";
    private final Activity activity;
    private final Runnable ready;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private AlertDialog dialog;
    private boolean busy=false,waitingPermission=false,firstResume=true;
    private volatile boolean closed=false;
    private volatile HttpURLConnection connection;
    private JSONObject release;
    AppUpdates(Activity activity,Runnable ready){this.activity=activity;this.ready=ready;}
    private boolean online(){
        ConnectivityManager cm=(ConnectivityManager)activity.getSystemService(Activity.CONNECTIVITY_SERVICE);
        NetworkCapabilities n=cm==null?null:cm.getNetworkCapabilities(cm.getActiveNetwork());
        return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    private void ui(Runnable action){activity.runOnUiThread(()->{if(!closed&&!activity.isFinishing()&&!activity.isDestroyed())action.run();});}
    private void dismiss(){if(dialog!=null){dialog.dismiss();dialog=null;}}
    private void show(String title,String message,String button,Runnable action){
        dismiss();AlertDialog.Builder b=new AlertDialog.Builder(activity).setTitle(title).setMessage(message).setCancelable(false);
        if(button!=null)b.setPositiveButton(button,(d,w)->action.run());
        b.setNegativeButton("退出 App",(d,w)->activity.finish());
        dialog=b.create();dialog.setCanceledOnTouchOutside(false);dialog.show();
    }
    void check(boolean manual){
        if(closed||busy)return;
        if(!online()){dismiss();ready.run();if(manual)Toast.makeText(activity,"当前未联网，已跳过更新检查",Toast.LENGTH_LONG).show();return;}
        // Let the POS open immediately; a failed check is not an "up to date" result.
        if(release==null)ready.run();
        busy=true;
        worker.execute(()->{
            try{
                JSONObject m=fetchManifest();
                PackageInfo installed=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0);
                ui(()->{busy=false;if(m.optLong("versionCode")<=installed.versionCode){dismiss();if(release!=null)ready.run();release=null;if(manual)Toast.makeText(activity,"当前已是最新版本",Toast.LENGTH_LONG).show();}else{release=m;offer();}});
            }catch(Exception e){ui(()->{busy=false;if(release!=null){offer();return;}if(manual)Toast.makeText(activity,"暂时无法检查更新，请稍后重试",Toast.LENGTH_LONG).show();});}
        });
    }
    private HttpURLConnection open(String address)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();connection=c;
        c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setRequestProperty("Cache-Control","no-cache");
        if(c.getResponseCode()!=200){int status=c.getResponseCode();c.disconnect();throw new IOException("更新服务响应 "+status);}
        return c;
    }
    private JSONObject fetchManifest()throws Exception{
        HttpURLConnection c=open(ENDPOINT);
        try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1){if(closed)throw new IOException("已取消");out.write(buf,0,n);if(out.size()>65536)throw new IOException("更新信息过大");}
            JSONObject m=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            if(m.getInt("schema")!=1||!activity.getPackageName().equals(m.getString("packageName"))||m.getLong("versionCode")<1||m.getLong("versionCode")>Integer.MAX_VALUE||!m.getString("versionName").matches("[0-9]+\\.[0-9]+\\.[0-9]+")||!m.getString("sha256").matches("[a-f0-9]{64}")||m.getLong("size")<1||m.getLong("size")>100*1024*1024||m.getString("notes").length()>4000)throw new IOException("更新信息不正确");
            return m;
        }finally{c.disconnect();connection=null;}
    }
    private void offer(){
        show("需要更新至 "+release.optString("versionName"),"联网使用需安装最新版本。\n安装包："+String.format(java.util.Locale.ROOT,"%.2f MB",release.optLong("size")/1048576.0)+"\n\n"+release.optString("notes"),"下载并安装",this::download);
    }
    private static String hex(byte[] bytes){StringBuilder b=new StringBuilder();for(byte v:bytes)b.append(String.format(java.util.Locale.ROOT,"%02x",v&255));return b.toString();}
    private File apk(){return new File(activity.getCacheDir(),"update.apk");}
    private void verify(File f,JSONObject m)throws Exception{
        if(f.length()!=m.getLong("size"))throw new IOException("安装包大小校验失败");
        MessageDigest md=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] buf=new byte[32768];int n;while((n=in.read(buf))!=-1)md.update(buf,0,n);}
        if(!hex(md.digest()).equals(m.getString("sha256")))throw new IOException("安装包完整性校验失败，请重新下载");
        PackageManager pm=activity.getPackageManager();PackageInfo next=pm.getPackageArchiveInfo(f.getAbsolutePath(),PackageManager.GET_SIGNATURES),own=pm.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
        if(next==null||!own.packageName.equals(next.packageName)||next.versionCode!=m.getInt("versionCode")||!m.getString("versionName").equals(next.versionName)||next.versionCode<=own.versionCode||own.signatures==null||next.signatures==null||!Arrays.equals(own.signatures,next.signatures))throw new IOException("安装包版本或签名不匹配");
    }
    private void download(){
        if(busy||closed)return;if(!online()){check(true);return;}
        busy=true;final JSONObject m=release;show("下载更新","正在下载，请保持网络连接…",null,null);
        worker.execute(()->{
            File tmp=new File(activity.getCacheDir(),"update.apk.part");
            try{
                HttpURLConnection c=open(ENDPOINT+"/apk/"+m.getString("sha256")+".apk");
                try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(tmp)){
                    byte[] buf=new byte[32768];long total=0,expected=m.getLong("size"),last=0;int n;
                    while((n=in.read(buf))!=-1){if(closed)throw new IOException("已取消");total+=n;if(total>expected)throw new IOException("安装包大小不正确");out.write(buf,0,n);
                        long now=System.currentTimeMillis();if(now-last>400){last=now;final long received=total;ui(()->{if(dialog!=null)dialog.setMessage("已下载 "+(received*100/expected)+"%\n请保持网络连接…");});}}
                    out.getFD().sync();
                }finally{c.disconnect();connection=null;}
                verify(tmp,m);if(!tmp.renameTo(apk()))throw new IOException("无法保存安装包，请检查可用空间");
                ui(()->{busy=false;install();});
            }catch(Exception e){tmp.delete();ui(()->{busy=false;show("更新未完成",e.getMessage(),"重新检查",()->check(true));});}
        });
    }
    private void install(){
        if(closed)return;
        show("完成更新后继续使用","安装包已校验。请在系统页面确认安装；若取消安装，可点击下方按钮重试。","继续安装",this::install);
        try{
            if(!activity.getPackageManager().canRequestPackageInstalls()){
                waitingPermission=true;
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));return;
            }
            Uri uri=Uri.parse("content://com.tcgshop.pos.update/update.apk");
            Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(ClipData.newRawUri("安装包",uri));activity.startActivity(intent);
        }catch(Exception e){waitingPermission=false;show("无法打开安装页面","请允许此应用安装更新后重试。","继续安装",this::install);}
    }
    void resume(){
        if(firstResume){firstResume=false;return;}
        if(waitingPermission){waitingPermission=false;if(activity.getPackageManager().canRequestPackageInstalls())install();return;}
        // Returning from the installer must retain the mandatory update gate.
        if(dialog==null&&!busy)check(false);
    }
    void close(){closed=true;if(connection!=null)connection.disconnect();worker.shutdownNow();dismiss();}
}
