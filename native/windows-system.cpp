#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <exdisp.h>
#include <shlguid.h>
#include <servprov.h>
#include <uiautomation.h>
#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <algorithm>

static DWORD mainThread;
static HWND selectedWindow;
static HHOOK keyboardHook;
static bool pressed=false, pending=false;
static IUIAutomation* automation=nullptr;
static const UINT PREVIEW=WM_APP+10, RESTORE=WM_APP+11;
std::string utf8(const std::wstring& value){int n=WideCharToMultiByte(CP_UTF8,0,value.c_str(),(int)value.size(),nullptr,0,nullptr,nullptr);std::string out(n,0);WideCharToMultiByte(CP_UTF8,0,value.c_str(),(int)value.size(),out.data(),n,nullptr,nullptr);return out;}
std::string json(const std::wstring& value){std::string out="\"";for(unsigned char c:utf8(value)){if(c=='"'||c=='\\'){out+='\\';out+=c;}else if(c<32){char b[7];snprintf(b,7,"\\u%04x",c);out+=b;}else out+=c;}return out+'"';}
void emit(const std::string& line){std::cout<<line<<std::endl;}
bool setValue(const std::wstring& key,const std::wstring& name,const std::wstring& value){HKEY h; if(RegCreateKeyExW(HKEY_CURRENT_USER,key.c_str(),0,nullptr,0,KEY_SET_VALUE,nullptr,&h,nullptr)!=ERROR_SUCCESS)return false;auto status=RegSetValueExW(h,name.empty()?nullptr:name.c_str(),0,REG_SZ,(const BYTE*)value.c_str(),DWORD((value.size()+1)*sizeof(wchar_t)));RegCloseKey(h);return status==ERROR_SUCCESS;}
int registerApp(int argc,wchar_t** argv){
    if(argc<4)return 2;const std::wstring exe=argv[2],command=L"\""+exe+L"\" \"%1\"",caps=L"Software\\LanYue\\Capabilities";
    bool ok=setValue(caps,L"ApplicationName",L"览阅")&&setValue(caps,L"ApplicationDescription",L"本地文件预览")&&setValue(caps,L"ApplicationIcon",L"\""+exe+L"\",0");
    ok=setValue(L"Software\\RegisteredApplications",L"LanYue",caps)&&ok;
    ok=setValue(L"Software\\Classes\\Applications\\LanYue.exe",L"FriendlyAppName",L"览阅")&&ok;
    ok=setValue(L"Software\\Classes\\Applications\\LanYue.exe\\shell\\open\\command",L"",command)&&ok;
    for(int i=3;i<argc;++i){std::wstring ext=argv[i];if(ext.empty()||ext.find_first_not_of(L"abcdefghijklmnopqrstuvwxyz0123456789-")!=std::wstring::npos)return 2;std::wstring prog=L"LanYue.File."+ext;
        ok=setValue(L"Software\\Classes\\"+prog,L"",L"览阅预览文件")&&ok;
        ok=setValue(L"Software\\Classes\\"+prog+L"\\DefaultIcon",L"",L"\""+exe+L"\",0")&&ok;
        ok=setValue(L"Software\\Classes\\"+prog+L"\\shell\\open\\command",L"",command)&&ok;
        ok=setValue(caps+L"\\FileAssociations",L"."+ext,prog)&&ok;
        ok=setValue(L"Software\\Classes\\."+ext+L"\\OpenWithProgids",prog,L"")&&ok;
        ok=setValue(L"Software\\Classes\\Applications\\LanYue.exe\\SupportedTypes",L"."+ext,L"")&&ok;
    }
    SHChangeNotify(SHCNE_ASSOCCHANGED,SHCNF_IDLIST,nullptr,nullptr);
    emit(ok?"{\"type\":\"registered\"}":"{\"type\":\"error\",\"message\":\"无法注册文件关联\"}");return ok?0:1;
}
bool isExplorer(HWND window){wchar_t name[128]={};GetClassNameW(window,name,128);return wcscmp(name,L"CabinetWClass")==0||wcscmp(name,L"ExploreWClass")==0||wcscmp(name,L"Progman")==0||wcscmp(name,L"WorkerW")==0;}
bool fileViewFocused(){
    GUITHREADINFO gui={sizeof(gui)};GetGUIThreadInfo(GetWindowThreadProcessId(GetForegroundWindow(),nullptr),&gui);
    wchar_t name[128]={};GetClassNameW(gui.hwndFocus,name,128);std::wstring cls=name;
    if(cls.find(L"Edit")!=std::wstring::npos||cls.find(L"edit")!=std::wstring::npos||cls==L"SysTreeView32")return false;
    if(!automation)return false;
    IUIAutomationElement* focus=nullptr;if(FAILED(automation->GetFocusedElement(&focus))||!focus)return false;
    CONTROLTYPEID type=0;focus->get_CurrentControlType(&type);focus->Release();
    return type==UIA_ListItemControlTypeId||type==UIA_DataItemControlTypeId||type==UIA_ListControlTypeId||type==UIA_DataGridControlTypeId;
}
void appendSelection(IDispatch* dispatch,std::vector<std::wstring>& paths){
    IServiceProvider* provider=nullptr;IShellBrowser* browser=nullptr;IShellView* view=nullptr;IFolderView2* folder=nullptr;IShellItemArray* selection=nullptr;
    if(SUCCEEDED(dispatch->QueryInterface(IID_PPV_ARGS(&provider)))&&SUCCEEDED(provider->QueryService(SID_STopLevelBrowser,IID_PPV_ARGS(&browser)))&&SUCCEEDED(browser->QueryActiveShellView(&view))){
        HWND viewWindow=nullptr;view->GetWindow(&viewWindow);
        if(IsWindowVisible(viewWindow)&&SUCCEEDED(view->QueryInterface(IID_PPV_ARGS(&folder)))&&SUCCEEDED(folder->GetSelection(FALSE,&selection))){
            DWORD count=0;selection->GetCount(&count);for(DWORD i=0;i<std::min<DWORD>(count,500);i++){IShellItem* item=nullptr;if(SUCCEEDED(selection->GetItemAt(i,&item))){PWSTR value=nullptr;SFGAOF attributes=0;item->GetAttributes(SFGAO_FOLDER,&attributes);if(!(attributes&SFGAO_FOLDER)&&SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH,&value))){paths.emplace_back(value);CoTaskMemFree(value);}item->Release();}}
        }
    }
    if(selection)selection->Release();if(folder)folder->Release();if(view)view->Release();if(browser)browser->Release();if(provider)provider->Release();
}
void preview(){
    pending=false;if(GetForegroundWindow()!=selectedWindow||!isExplorer(selectedWindow)||!fileViewFocused())return;
    IShellWindows* windows=nullptr;if(FAILED(CoCreateInstance(CLSID_ShellWindows,nullptr,CLSCTX_LOCAL_SERVER,IID_PPV_ARGS(&windows))))return;
    std::vector<std::wstring> paths;long count=0;windows->get_Count(&count);
    for(long i=0;i<count&&paths.empty();i++){VARIANT index;VariantInit(&index);index.vt=VT_I4;index.lVal=i;IDispatch* dispatch=nullptr;if(SUCCEEDED(windows->Item(index,&dispatch))&&dispatch){IWebBrowser2* browser=nullptr;if(SUCCEEDED(dispatch->QueryInterface(IID_PPV_ARGS(&browser)))){SHANDLE_PTR handle=0;browser->get_HWND(&handle);if((HWND)handle==selectedWindow)appendSelection(dispatch,paths);browser->Release();}dispatch->Release();}}
    if(paths.empty()) {VARIANT location,root;VariantInit(&location);VariantInit(&root);location.vt=VT_I4;location.lVal=CSIDL_DESKTOP;long hwnd=0;IDispatch* desktop=nullptr;wchar_t cls[64]={};GetClassNameW(selectedWindow,cls,64);if((wcscmp(cls,L"Progman")==0||wcscmp(cls,L"WorkerW")==0)&&SUCCEEDED(windows->FindWindowSW(&location,&root,SWC_DESKTOP,&hwnd,SWFO_NEEDDISPATCH,&desktop))&&desktop){appendSelection(desktop,paths);desktop->Release();}}
    windows->Release();if(paths.empty())return;std::string result="{\"type\":\"preview\",\"paths\":[";for(size_t i=0;i<paths.size();i++){if(i)result+=",";result+=json(paths[i]);}emit(result+"]}");
}
LRESULT CALLBACK keyEvent(int code,WPARAM message,LPARAM value){
    if(code>=0){auto key=(KBDLLHOOKSTRUCT*)value;if(key->vkCode==VK_SPACE&&!(key->flags&LLKHF_INJECTED)){
        if((message==WM_KEYUP||message==WM_SYSKEYUP)&&pressed){pressed=false;return 1;}
        if(message==WM_KEYDOWN&&isExplorer(GetForegroundWindow())&&!(GetAsyncKeyState(VK_CONTROL)&0x8000)&&!(GetAsyncKeyState(VK_MENU)&0x8000)&&!(GetAsyncKeyState(VK_SHIFT)&0x8000)&&!(GetAsyncKeyState(VK_LWIN)&0x8000)&&!(GetAsyncKeyState(VK_RWIN)&0x8000)&&fileViewFocused()){
            if(!pressed&&!pending){pressed=true;pending=true;selectedWindow=GetForegroundWindow();PostThreadMessageW(mainThread,PREVIEW,0,0);}return 1;
        }
    }}return CallNextHookEx(keyboardHook,code,message,value);
}
int wmain(int argc,wchar_t** argv){
    if(argc>1&&wcscmp(argv[1],L"--register")==0)return registerApp(argc,argv);
    if(argc<2||wcscmp(argv[1],L"--watch")!=0)return 2;
    CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);mainThread=GetCurrentThreadId();MSG msg;PeekMessageW(&msg,nullptr,0,0,PM_NOREMOVE);
    CoCreateInstance(CLSID_CUIAutomation,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&automation));
    if(!automation){emit("{\"type\":\"error\",\"message\":\"无法读取资源管理器选择\"}");return 3;}
    keyboardHook=SetWindowsHookExW(WH_KEYBOARD_LL,keyEvent,GetModuleHandleW(nullptr),0);
    if(!keyboardHook){emit("{\"type\":\"error\",\"message\":\"无法启用空格预览\"}");return 3;}
    std::thread([]{std::string line;while(std::getline(std::cin,line)){if(line=="restore")PostThreadMessageW(mainThread,RESTORE,0,0);}PostThreadMessageW(mainThread,WM_QUIT,0,0);}).detach();
    emit("{\"type\":\"ready\"}");
    while(GetMessageW(&msg,nullptr,0,0)>0){if(msg.message==PREVIEW)preview();else if(msg.message==RESTORE){if(IsWindow(selectedWindow))SetForegroundWindow(selectedWindow);}else{TranslateMessage(&msg);DispatchMessageW(&msg);}}
    UnhookWindowsHookEx(keyboardHook);automation->Release();CoUninitialize();return 0;
}
