package com.tcgshop.pos;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.provider.MediaStore;
import android.view.WindowInsets;
import android.view.View;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final int PICK=10,SAVE=11,CAMERA_WEB=12,CAMERA_FILE=13,PRINTER_PERMISSION=14;
    private WebView web;
    private AppUpdates updates;
    private final NasTransport nas=new NasTransport();
    private PrinterTransport printer;
    private Runnable pendingPrinter;
    private String pendingPrinterId;
    private String pairingRequestId;
    private static final int PRINTER_PAIR=15;
    private FrameLayout safeFrame;
    private ValueCallback<Uri[]> picker;
    private PermissionRequest cameraRequest;
    private boolean capturing=false;
    private String pendingBackup;
    private final Uri photoUri=Uri.parse("content://com.tcgshop.pos.cover/cover.jpg");
    private boolean local(Uri uri){return "https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);}
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        printer=new PrinterTransport(getApplicationContext());
        safeFrame=new FrameLayout(this);safeFrame.setBackgroundColor(Color.WHITE);
        web=new WebView(this);safeFrame.addView(web,new FrameLayout.LayoutParams(-1,-1));
        // Size the entire WebView within the safe rectangle. Padding the WebView
        // itself does not move CSS fixed elements or shrink its layout viewport.
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            safeFrame.setOnApplyWindowInsetsListener((v,i)->{
                int bars=WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout();
                int handled=bars|WindowInsets.Type.ime();
                Insets safe=i.getInsets(handled);
                v.setPadding(safe.left,safe.top,safe.right,safe.bottom);
                // Forward zero-valued updates rather than consuming everything:
                // WebView must receive keyboard-hide and rotation notifications.
                return new WindowInsets.Builder(i).setInsets(handled,Insets.NONE)
                    .setInsetsIgnoringVisibility(bars,Insets.NONE)
                    .setStableInsets(Insets.NONE).setDisplayCutout(null).build();
            });
        }else{
            // Older Android uses the system's fitted content area and adjustResize.
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            safeFrame.setFitsSystemWindows(true);
            if(Build.VERSION.SDK_INT>=28){WindowManager.LayoutParams a=getWindow().getAttributes();a.layoutInDisplayCutoutMode=WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;getWindow().setAttributes(a);}
        }
        setContentView(safeFrame);
        if(Build.VERSION.SDK_INT>=30){WindowInsetsController controller=getWindow().getInsetsController();if(controller!=null)controller.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}
        safeFrame.requestApplyInsets();
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDefaultTextEncodingName("UTF-8");s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMediaPlaybackRequiresUserGesture(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new BackupBridge(),"NativePOS");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !local(r.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                Uri u=r.getUrl();if(!local(u))return missing();String p=u.getPath();
                if(p==null||p.contains("..")||!p.startsWith("/assets/"))return missing();
                String name=p.substring(8);String mime=name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".html")?"text/html":"text/plain";
                try{return new WebResourceResponse(mime,"UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-store"),getAssets().open(name));}catch(IOException e){return missing();}
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest r){runOnUiThread(()->{
                boolean video=false;for(String resource:r.getResources())if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource))video=true;
                if(!local(r.getOrigin())||!video){r.deny();return;}
                if(cameraRequest!=null)cameraRequest.deny();cameraRequest=r;
                if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)grantCamera();
                else requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_WEB);
            });}
            @Override public void onPermissionRequestCanceled(PermissionRequest r){if(cameraRequest==r)cameraRequest=null;}
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(picker!=null)picker.onReceiveValue(null);picker=callback;
                capturing=params.isCaptureEnabled();
                if(capturing&&checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_FILE);
                else if(capturing)capturePhoto();else selectFile(params.getAcceptTypes());
                return true;
            }
        });
        // Stable secure origin keeps localStorage across upgrades and enables WebRTC camera APIs.
        // Open the POS immediately while the update check runs in the background.
        updates=new AppUpdates(this,()->{if(web==null)return;if(web.getUrl()==null)web.loadUrl(ORIGIN+"/assets/index.html");else web.evaluateJavascript("window.POSSync&&window.POSSync.onResume()",null);});updates.check(false);
    }
    private WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private void grantCamera(){if(cameraRequest!=null){cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});cameraRequest=null;}}
    private void selectFile(String[] accept){
        capturing=false;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        boolean json=false;for(String type:accept)if(type.contains("json"))json=true;
        i.setType(json?"*/*":"image/*");
        try{startActivityForResult(i,PICK);}catch(Exception e){finishPicker(null);message("未找到文件选择器");}
    }
    private void capturePhoto(){
        try{
            // Replace only the application's disposable camera cache file.
            new FileOutputStream(new File(getCacheDir(),"cover.jpg")).close();
            Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,photoUri);
            i.setClipData(ClipData.newRawUri("商品封面",photoUri));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(i,PICK);
        }catch(Exception e){message("系统相机不可用，请选择照片");selectFile(new String[]{"image/*"});}
    }
    private void finishPicker(Uri[] value){if(picker!=null){picker.onReceiveValue(value);picker=null;}capturing=false;}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
        super.onRequestPermissionsResult(code,permissions,results);boolean granted=results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED;
        if(code==CAMERA_WEB){if(granted)grantCamera();else if(cameraRequest!=null){cameraRequest.deny();cameraRequest=null;}}
        else if(code==CAMERA_FILE){if(granted)capturePhoto();else{message("相机权限未允许，可选择照片");selectFile(new String[]{"image/*"});}}
        else if(code==PRINTER_PERMISSION){Runnable task=pendingPrinter;String id=pendingPrinterId;pendingPrinter=null;pendingPrinterId=null;if(task!=null){if(granted)task.run();else printerResult(id,PrinterTransport.error("请允许附近设备权限后重试"));}}
    }
    private void printerResult(String id,org.json.JSONObject result){runOnUiThread(()->{if(web!=null&&web.getUrl()!=null&&web.getUrl().startsWith(ORIGIN+"/assets/"))web.evaluateJavascript("window.POSPrinter&&window.POSPrinter.receiveNative("+org.json.JSONObject.quote(id)+","+result.toString()+")",null);});}
    public final class BackupBridge {
        @JavascriptInterface public void checkUpdates(){runOnUiThread(()->{if(updates!=null&&web!=null&&web.getUrl()!=null&&web.getUrl().startsWith(ORIGIN+"/assets/"))updates.check(true);});}
        private static final int MAX_PRINTER_PAYLOAD=4000000;
        @JavascriptInterface public void printerRequest(String id,String action,String payload){
            if(id==null||!id.matches("[-a-zA-Z0-9]{1,100}"))return;
            if(action==null||payload==null){printerResult(id,PrinterTransport.error("打印请求不完整，请重新打开小票后重试"));return;}
            if(payload.length()>MAX_PRINTER_PAYLOAD){printerResult(id,PrinterTransport.error("小票图片或内容过大，请缩小 Logo 或关闭二维码后重试"));return;}
            runOnUiThread(()->{
                if(web==null||web.getUrl()==null||!web.getUrl().startsWith(ORIGIN+"/assets/"))return;
                if(action.equals("settings")){try{startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS));org.json.JSONObject ok=new org.json.JSONObject();ok.put("ok",true);printerResult(id,ok);}catch(Exception e){printerResult(id,PrinterTransport.error("无法打开系统蓝牙设置"));}return;}
                if(!java.util.Arrays.asList("pair","devices","connect","disconnect","status","print").contains(action)){printerResult(id,PrinterTransport.error("不支持的小票机操作，请更新应用后重试"));return;}
                if(pairingRequestId!=null){printerResult(id,PrinterTransport.error("请先完成系统配对并返回应用"));return;}
                if(pendingPrinter!=null){printerResult(id,PrinterTransport.error("请先完成蓝牙权限授权"));return;}
                Runnable task=()->{
                    if(action.equals("pair")){
                        try{pairingRequestId=id;startActivityForResult(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS),PRINTER_PAIR);}
                        catch(Exception e){pairingRequestId=null;printerResult(id,PrinterTransport.error("无法打开配对页面，请手动进入系统蓝牙设置配对"));}
                    }else printer.request(action,payload,result->printerResult(id,result));
                };
                if(Build.VERSION.SDK_INT>=31&&!action.equals("disconnect")&&!action.equals("status")&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED){
                    if(action.equals("print")){printerResult(id,PrinterTransport.error("请先在小票机设置中刷新设备并授权连接，再打印"));return;}
                    pendingPrinter=task;pendingPrinterId=id;requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT},PRINTER_PERMISSION);
                }else task.run();
            });
        }
        @JavascriptInterface public void nasRequest(String id,String base,String path,String method,String token,String etag,String body){
            nasRequestV3(id,base,path,method,token,etag,body,false);
        }
        @JavascriptInterface public void nasRequestV3(String id,String base,String path,String method,String token,String etag,String body,boolean compress){
            if(id==null||!id.matches("[-a-zA-Z0-9]{1,100}"))return;
            runOnUiThread(()->{if(web==null||web.getUrl()==null||!web.getUrl().startsWith(ORIGIN+"/assets/"))return;nas.request(base,path,method,token,etag,body,compress,result->runOnUiThread(()->{if(web!=null&&web.getUrl()!=null&&web.getUrl().startsWith(ORIGIN+"/assets/"))web.evaluateJavascript("window.POSSync&&window.POSSync.receiveNative("+org.json.JSONObject.quote(id)+","+result.toString()+")",null);}));});
        }
        @JavascriptInterface public void saveBackup(String name,String text){
            if(text==null||text.length()>20000000)return;
            runOnUiThread(()->{
                if(!web.getUrl().startsWith(ORIGIN+"/assets/"))return;
                if(pendingBackup!=null){message("请先完成当前备份保存");return;}
                pendingBackup=text;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,name.replaceAll("[^a-zA-Z0-9._-]","_"));
                try{startActivityForResult(i,SAVE);}catch(Exception e){pendingBackup=null;message("无法打开保存位置选择器");}
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PRINTER_PAIR){
            String id=pairingRequestId;pairingRequestId=null;
            // Settings does not report pairing success via resultCode. Read actual bonds.
            if(id!=null)printer.request("devices","{}",reply->printerResult(id,reply));
            return;
        }
        if(request==PICK){Uri uri=result==RESULT_OK?(capturing?photoUri:data==null?null:data.getData()):null;finishPicker(uri==null?null:new Uri[]{uri});}
        if(request==SAVE){String content=pendingBackup;pendingBackup=null;
            if(result==RESULT_OK&&data!=null&&data.getData()!=null&&content!=null){
                new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(data.getData(),"wt")){if(out==null)throw new IOException();out.write(content.getBytes(StandardCharsets.UTF_8));runOnUiThread(()->message("备份已保存"));}catch(Exception e){runOnUiThread(()->message("备份保存失败，请重新导出"));}}).start();
            }else message("已取消备份保存");
        }
    }
    private void message(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    @Override public void onBackPressed(){web.evaluateJavascript("Boolean(window.closePOSOverlay&&window.closePOSOverlay())",r->{if(!"true".equals(r))MainActivity.super.onBackPressed();});}
    @Override protected void onPause(){web.evaluateJavascript("window.POSSync&&window.POSSync.pause()",null);if(cameraRequest==null)web.evaluateJavascript("document.querySelectorAll('#coverCameraDialog[open]').forEach(d=>d.close());window.dispatchEvent(new Event('pospause'));",null);web.onPause();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();if(safeFrame!=null)safeFrame.requestApplyInsets();if(updates!=null)updates.resume();}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);if(safeFrame!=null)safeFrame.requestApplyInsets();}
    @Override protected void onDestroy(){if(updates!=null)updates.close();if(picker!=null)finishPicker(null);if(cameraRequest!=null){cameraRequest.deny();cameraRequest=null;}pendingPrinter=null;pendingPrinterId=null;printer.close();nas.close();web.removeJavascriptInterface("NativePOS");web.destroy();web=null;super.onDestroy();}
}
