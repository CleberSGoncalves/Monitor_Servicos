@ECHO OFF
REM ###########################################################################################################################################
REM #													      																			      # 	
REM #			       						 Script de desinstalação do serviço DNA.TrackingSVC                     						  #	
REM #													      																			      #	
REM #			    								  Criado por: Engenharia IBOPE                    	          	   					   	  #	
REM #													  												     								  #	
REM ###########################################################################################################################################

%WINDIR%\Microsoft.NET\Framework\v4.0.30319\InstallUtil.exe ..\..\..\..\..\MediaDNA_V2\Applications\TrackingSVC\DNA.TrackingSVC.exe -u
pause
