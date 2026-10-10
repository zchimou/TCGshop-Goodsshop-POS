package com.tcgshop.pos;

// Adapted from DantSu/ESCPOS-ThermalPrinter-Android BluetoothConnection.java,
// commit f61030e46269319e2d72b938501676420657b9c8 (MIT, Franck ALARY).
// See pos/vendor/DantSu-LICENSE.txt. Changes: SPP only, paired-device workflow,
// cancel-safe socket ownership, bounded chunk writes, no discovery permission.
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;

final class BluetoothPrinterConnection {
    private static final UUID SPP=UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");
    private volatile BluetoothSocket socket;
    private volatile boolean closed;
    final String address;
    BluetoothPrinterConnection(String address){this.address=address;}
    void connect(BluetoothDevice device) throws IOException {
        BluetoothSocket candidate=device.createRfcommSocketToServiceRecord(SPP);
        synchronized(this){if(closed){candidate.close();throw new IOException("连接已取消");}socket=candidate;}
        candidate.connect();
        if(closed)throw new IOException("连接已取消");
    }
    boolean connected(){BluetoothSocket s=socket;return !closed&&s!=null&&s.isConnected();}
    void send(byte[] data) throws IOException,InterruptedException {
        BluetoothSocket s=socket;if(!connected()||s==null)throw new IOException("小票机未连接");
        OutputStream out=s.getOutputStream();
        for(int offset=0;offset<data.length;offset+=512){
            if(closed||Thread.currentThread().isInterrupted())throw new IOException("打印已取消");
            out.write(data,offset,Math.min(512,data.length-offset));out.flush();Thread.sleep(15);
        }
    }
    void close(){BluetoothSocket s;synchronized(this){closed=true;s=socket;socket=null;}if(s!=null)try{s.close();}catch(IOException ignored){}}
}
