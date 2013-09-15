@echo off

cd c:\code\chrome\sidewise

echo --------------------------------------------------------
echo CLEAN
echo --------------------------------------------------------

del ext.zip
rmdir /skq ext_compiled
mkdir ext_compiled
if %ERRORLEVEL gt 0 (echo **** ERROR, ABORTING MAKE **** && quit)

echo --------------------------------------------------------
echo COPYING FILES
echo --------------------------------------------------------

copy /s ext\* ext_compiled
if %ERRORLEVEL gt 0 (echo **** ERROR, ABORTING MAKE **** && quit)
del ext_compiled\.gitignore
del ext_compiled\todo.txt
del ext_compiled\make.bat

cd ext_compiled


echo --------------------------------------------------------
echo COMPILING JAVASCRIPT
echo --------------------------------------------------------

if %ERRORLEVEL gt 0 (echo **** ERROR, ABORTING MAKE **** && quit)
for /[!*min.js] /[!*jquery*] /[!*jqgrid*] /[!*.idea*] /r %x in (*.js) do (set osize=%@FILESIZE[%x] & echo %x & java -jar c:\code\chrome\sidewise\closure-compiler\compiler.jar --js "%x" --js_output_file "%x.compiled" --summary_detail_level 1 && del /q "%x" && move /q "%x.compiled" "%x" && set delta=%@EVAL[%@FILESIZE[%x] / %osize% * 100=1,1] && echo %x [%osize% -^> %@FILESIZE[%x] bytes / %delta%%%])
for /r %x in (*.js.compiled) do del "%x"

echo --------------------------------------------------------
echo ATTACHING LICENSE TEXT
echo --------------------------------------------------------
echo /* Copyright (c) 2012 Joel Thornton ^<sidewise@joelpt.net^> See LICENSE.txt for license details. */ > c:\code\chrome\sidewise\LICENSE_attach.txt
echo. >> c:\code\chrome\sidewise\LICENSE_attach.txt
for /[!*min.js] /[!*jquery*] /[!*jqgrid*] /r %x in (*.js) do (echo Licensing %x && copy /q /b c:\code\chrome\sidewise\LICENSE_attach.txt+%x %x.licensed && del /q "%x" && move /q "%x.licensed" "%x" )
if %ERRORLEVEL gt 0 (echo **** ERROR, ABORTING MAKE **** && quit)

echo --------------------------------------------------------
echo ZIPPING
echo --------------------------------------------------------

zip -9 -r ..\ext.zip . -x .gitignore
if %ERRORLEVEL gt 0 (echo **** ERROR, ABORTING MAKE **** && quit)
cd ..
