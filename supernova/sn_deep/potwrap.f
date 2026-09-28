c wrapper subroutines for f2py: AV18, Reid93, Nijmegen-II partial-wave potentials
      subroutine av18w(l,s,j,t,t1z,t2z,n,r,v)
      implicit none
      integer l,s,j,t,t1z,t2z,n,i
      real*8 r(n), v(n,2,2), vpw(2,2)
cf2py intent(in) l,s,j,t,t1z,t2z,r
cf2py intent(out) v
cf2py depend(n) v
      do i=1,n
        call av18pw(1,l,s,j,t,t1z,t2z,r(i),vpw)
        v(i,1,1)=vpw(1,1)
        v(i,1,2)=vpw(1,2)
        v(i,2,1)=vpw(2,1)
        v(i,2,2)=vpw(2,2)
      enddo
      return
      end

      subroutine reid93w(name,type,n,r,v)
      implicit none
      character*3 name
      character*2 type
      integer n,i
      real*8 r(n), v(n,2,2), vpot(2,2)
cf2py intent(in) name,type,r
cf2py intent(out) v
cf2py depend(n) v
      do i=1,n
        call rreid93(r(i),name,type,vpot)
        v(i,1,1)=vpot(1,1)
        v(i,1,2)=vpot(1,2)
        v(i,2,1)=vpot(2,1)
        v(i,2,2)=vpot(2,2)
      enddo
      return
      end

      subroutine nijmw(idp,name,type,n,r,v)
      implicit none
      character*3 name, phname
      character*2 type
      integer n,i,idp,idpar
      logical nonrel
      real*8 r(n), v(n,2,2), vpot(2,2), fi, dfi, ddfi
      common/emanhp/phname
      common/choice/idpar
      common/relkin/nonrel
cf2py intent(in) idp,name,type,r
cf2py intent(out) v
cf2py depend(n) v
      phname=name
      idpar=idp
      nonrel=.true.
      do i=1,n
        call rnijmlsj(r(i),type,vpot,fi,dfi,ddfi)
        v(i,1,1)=vpot(1,1)
        v(i,1,2)=vpot(1,2)
        v(i,2,1)=vpot(2,1)
        v(i,2,2)=vpot(2,2)
      enddo
      return
      end
