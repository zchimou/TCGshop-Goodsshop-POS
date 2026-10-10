package com.tcgshop.pos;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Only grants access to the single temporary camera output, never arbitrary paths. */
public class CoverProvider extends ContentProvider {
    private File image(Uri uri) throws FileNotFoundException {
        if (!"com.tcgshop.pos.cover".equals(uri.getAuthority()) || !"/cover.jpg".equals(uri.getPath())) throw new FileNotFoundException();
        return new File(getContext().getCacheDir(), "cover.jpg");
    }
    public boolean onCreate() { return true; }
    public String getType(Uri uri) { return "image/jpeg"; }
    public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(image(uri), ParcelFileDescriptor.parseMode(mode));
    }
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort) {
        try { File file=image(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{"cover.jpg",file.length()});return c; }
        catch(FileNotFoundException e){return null;}
    }
    public Uri insert(Uri uri,ContentValues v){throw new UnsupportedOperationException();}
    public int delete(Uri uri,String s,String[] a){throw new UnsupportedOperationException();}
    public int update(Uri uri,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}
