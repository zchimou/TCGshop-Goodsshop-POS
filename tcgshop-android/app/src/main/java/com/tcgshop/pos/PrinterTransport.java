package com.tcgshop.pos;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

final class PrinterTransport {
    interface Callback {void done(JSONObject result);}
    private final Context context;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService clock=Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean busy=new AtomicBoolean(false);
    private volatile BluetoothPrinterConnection connection;
    private volatile boolean closed;
    PrinterTransport(Context context){this.context=context;}
    static JSONObject error(String message){JSONObject o=new JSONObject();try{o.put("ok",false).put("message",message);}catch(Exception ignored){}return o;}
    private static void progress(Callback callback,String message) throws Exception {callback.done(new JSONObject().put("progress",true).put("message",message));}
    private BluetoothAdapter adapter(){BluetoothManager manager=(BluetoothManager)context.getSystemService(Context.BLUETOOTH_SERVICE);BluetoothAdapter a=manager==null?null:manager.getAdapter();if(a==null)throw new IllegalStateException("此设备不支持蓝牙");if(!a.isEnabled())throw new IllegalStateException("请先在系统设置中开启蓝牙");return a;}
    private void connect(String address,AtomicBoolean expired) throws Exception {
        if(!BluetoothAdapter.checkBluetoothAddress(address))throw new IllegalArgumentException("请选择已配对的小票机");
        BluetoothDevice device=adapter().getRemoteDevice(address);
        if(device.getBondState()!=BluetoothDevice.BOND_BONDED)throw new IllegalArgumentException("请先在系统蓝牙设置中配对小票机");
        if(device.getType()==BluetoothDevice.DEVICE_TYPE_LE)throw new IllegalArgumentException("此设备仅支持低功耗蓝牙，当前需要经典蓝牙 SPP 小票机");
        BluetoothPrinterConnection c=connection;if(c!=null&&c.address.equals(address)&&c.connected())return;
        disconnect();c=new BluetoothPrinterConnection(address);
        synchronized(this){if(closed||expired.get())throw new IllegalStateException("操作已取消或超时");connection=c;}
        c.connect(device);
    }
    private void disconnect(){BluetoothPrinterConnection c=connection;connection=null;if(c!=null)c.close();}
    void request(String action,String payload,Callback callback){
        if(closed){callback.done(error("应用已关闭"));return;}
        if(!busy.compareAndSet(false,true)){callback.done(error("正在处理小票机操作，请稍候"));return;}
        worker.execute(()->{
            AtomicBoolean expired=new AtomicBoolean(false),finished=new AtomicBoolean(false);
            ScheduledFuture<?> timeout=clock.schedule(()->{synchronized(this){if(!finished.get()){expired.set(true);disconnect();}}},action.equals("print")?90:15,TimeUnit.SECONDS);
            try{
                JSONObject result=new JSONObject().put("ok",true);
                if(action.equals("devices")){
                    JSONArray list=new JSONArray();for(BluetoothDevice d:adapter().getBondedDevices())if(d.getType()!=BluetoothDevice.DEVICE_TYPE_LE)list.put(new JSONObject().put("address",d.getAddress()).put("name",d.getName()==null?"蓝牙设备":d.getName()));
                    result.put("devices",list);
                }else if(action.equals("connect")){
                    connect(new JSONObject(payload).getString("address"),expired);result.put("message","连接已建立");
                }else if(action.equals("disconnect")){disconnect();result.put("message","已断开");}
                else if(action.equals("print")){
                    progress(callback,"正在生成小票图片…");
                    JSONObject job=new JSONObject(payload);byte[] data=ReceiptRaster.encode(job);if(expired.get())throw new IllegalStateException("操作超时");
                    progress(callback,"正在确认蓝牙连接…");
                    connect(job.getString("address"),expired);BluetoothPrinterConnection c=connection;if(c==null)throw new IllegalStateException("连接已断开");
                    progress(callback,"正在发送小票数据（"+((data.length+1023)/1024)+" KB）…");c.send(data);
                    result.put("message","数据已发送，请确认小票机实际出纸");
                }else if(!action.equals("status"))throw new IllegalArgumentException("不支持的小票机操作");
                if(expired.get())throw new IllegalStateException("操作超时");
                BluetoothPrinterConnection c=connection;result.put("connected",c!=null&&c.connected()).put("address",c==null?"":c.address);
                callback.done(result);
            }catch(Exception e){
                disconnect();String message=e instanceof SecurityException?"请允许附近设备权限后重试":expired.get()?"连接或发送超时":e.getMessage();
                if(message==null||message.isEmpty())message="无法连接小票机，请检查电源、配对和距离";
                if(action.equals("print"))message+="；可能已有部分内容出纸，请检查后再手动重试";
                callback.done(error(message));
            }finally{synchronized(this){finished.set(true);timeout.cancel(false);busy.set(false);}}
        });
    }
    void close(){closed=true;disconnect();worker.shutdownNow();clock.shutdownNow();}
}
