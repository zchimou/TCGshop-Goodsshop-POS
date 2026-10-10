package com.tcgshop.pos;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.graphics.Paint;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import java.io.ByteArrayOutputStream;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;

/** Minimal temporary receipt renderer. Chinese is rasterized using Android fonts. */
final class ReceiptRaster {
    private static String clean(String line){return line.replaceAll("[\\p{Cntrl}\\u202A-\\u202E\\u2066-\\u2069]"," ");}
    private static Bitmap textBlock(String text,int width,Layout.Alignment alignment){
        TextPaint paint=new TextPaint(3);paint.setColor(Color.BLACK);paint.setTextSize(24);
        StaticLayout layout=StaticLayout.Builder.obtain(text,0,text.length(),paint,width-16).setAlignment(alignment).setIncludePad(true).setLineSpacing(4,1).build();
        if(layout.getHeight()>20000)throw new IllegalArgumentException("小票内容过长");
        Bitmap bitmap=Bitmap.createBitmap(width,Math.max(1,layout.getHeight()),Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);canvas.translate(8,0);layout.draw(canvas);return bitmap;
    }
    private static void writeBitmap(ByteArrayOutputStream out,Bitmap bitmap,int width) throws Exception{
        if(bitmap.getWidth()!=width){
            Bitmap padded=Bitmap.createBitmap(width,bitmap.getHeight(),Bitmap.Config.ARGB_8888);
            try{Canvas canvas=new Canvas(padded);canvas.drawColor(Color.WHITE);canvas.drawBitmap(bitmap,(width-bitmap.getWidth())/2f,0,null);writeBitmap(out,padded,width);}finally{padded.recycle();}
            return;
        }
        for(int top=0;top<bitmap.getHeight();top+=128){int height=Math.min(128,bitmap.getHeight()-top),bytes=width/8;out.write(new byte[]{29,118,48,0,(byte)(bytes&255),(byte)(bytes>>8),(byte)(height&255),(byte)(height>>8)});int[] pixels=new int[width];for(int y=0;y<height;y++){bitmap.getPixels(pixels,0,width,0,top+y,width,1);for(int x=0;x<width;x+=8){int bits=0;for(int b=0;b<8;b++){int c=pixels[x+b];if(Color.red(c)*299+Color.green(c)*587+Color.blue(c)*114<160000)bits|=128>>b;}out.write(bits);}}}
    }
    private static Bitmap logo(String data,int width){
        try{int comma=data.indexOf(',');if(comma<0||data.length()>1200000)return null;byte[] raw=Base64.decode(data.substring(comma+1),Base64.DEFAULT);Bitmap source=BitmapFactory.decodeByteArray(raw,0,raw.length);if(source==null)return null;float scale=Math.min(1f,(width-32f)/source.getWidth());int w=Math.max(1,Math.round(source.getWidth()*scale)),h=Math.max(1,Math.round(source.getHeight()*scale));return Bitmap.createScaledBitmap(source,w,h,true);}catch(Exception ignored){return null;}
    }
    static byte[] encode(JSONObject job) throws Exception {
        int width=job.getInt("width");if(width!=384&&width!=576)throw new IllegalArgumentException("请选择 58mm 或 80mm 纸宽");
        JSONArray lines=job.getJSONArray("lines");if(lines.length()==0||lines.length()>800)throw new IllegalArgumentException("小票内容过长");
        StringBuilder main=new StringBuilder();for(int i=0;i<lines.length();i++){String line=clean(lines.getString(i));if(line.length()>1000)throw new IllegalArgumentException("单行内容过长");main.append(line).append('\n');}if(main.length()>40000)throw new IllegalArgumentException("小票内容过长");
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(new byte[]{27,64,27,97,0});
        Bitmap logo=logo(job.optString("logo",""),width);if(logo!=null){writeBitmap(out,logo,width);logo.recycle();}
        JSONArray headers=job.optJSONArray("centerLines");if(headers!=null&&headers.length()>0){StringBuilder h=new StringBuilder();for(int i=0;i<headers.length();i++)h.append(clean(headers.getString(i))).append('\n');Bitmap b=textBlock(h.toString(),width,Layout.Alignment.ALIGN_CENTER);writeBitmap(out,b,width);b.recycle();}
        Bitmap body=textBlock(main.toString(),width,Layout.Alignment.ALIGN_NORMAL);if(body.getHeight()>20000)throw new IllegalArgumentException("小票过长，请联系管理员");writeBitmap(out,body,width);body.recycle();
        if(job.optBoolean("showQr",true)){
            JSONArray codes=job.optJSONArray("socialCodes");
            if(codes==null||codes.length()!=2)throw new IllegalArgumentException("二维码图片缺失，请更新应用后重试");
            int column=width/2;
            Bitmap row=Bitmap.createBitmap(width,column+48,Bitmap.Config.ARGB_8888);
            try {
                Canvas canvas=new Canvas(row);canvas.drawColor(Color.WHITE);
                for(int i=0;i<codes.length();i++){
                    JSONObject item=codes.getJSONObject(i);
                    Bitmap code=logo(item.getString("image"),column);
                    if(code==null)throw new IllegalArgumentException("二维码图片无法读取");
                    try{canvas.drawBitmap(code,i*column+(column-code.getWidth())/2f,8,null);}finally{code.recycle();}
                    Bitmap label=textBlock(clean(item.getString("label")),column,Layout.Alignment.ALIGN_CENTER);
                    try{canvas.drawBitmap(label,i*column,column-16,null);}finally{label.recycle();}
                }
                writeBitmap(out,row,width);
            } finally {row.recycle();}
        }
        JSONArray footers=job.optJSONArray("footerLines");if(footers!=null&&footers.length()>0){StringBuilder f=new StringBuilder();for(int i=0;i<footers.length();i++)f.append(clean(footers.getString(i))).append('\n');Bitmap b=textBlock(f.toString(),width,Layout.Alignment.ALIGN_CENTER);writeBitmap(out,b,width);b.recycle();}
        out.write(new byte[]{27,100,3});return out.toByteArray();
    }
}
