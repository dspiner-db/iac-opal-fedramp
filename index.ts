// import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
// import { randomUUID } from "crypto";
// import { SubnetCIDRAdviser, ICalculatorSubnet, calculate } from 'subnet-cidr-calculator'

// const CONFIG = new pulumi.Config()
// const PROJECT_ID = CONFIG.get('projectId') || process.env.PROJECT_ID || randomUUID()
// const STACK_NAME = pulumi.getStack()
// const PROJECT_NAME = CONFIG.get('projectName') || pulumi.getProject()
// const BASE_NAME = `${STACK_NAME}-${PROJECT_NAME}`
// const CIDR = CONFIG.require('cidr')
// const SUBNET_NETMASK = CONFIG.get('subnetNetmask') || 24
// const OWNER = CONFIG.require('owner')
// const AWS_REGION = 'us-west-2'

// function createTags(Name: string){
//     return {
//         Project: PROJECT_NAME,
//         Owner: OWNER,
//         ClusterName: `${BASE_NAME}-cluster`,
//         Environment: STACK_NAME,
//         ProjectId: PROJECT_ID,
//         Name
//     }
// }


// function getSubnets(cidr: string, subnetNetmask: string): ICalculatorSubnet[] {
//     // Get the Cidr in a format for for creating subnets
//     let [vpcAddress, netmask] = cidr.split('/')

//     // Define the subnet CIDRs based on vpc CIDR and subnetNetmask
//     let t = calculate(vpcAddress, netmask, [ cidr ])
//     return t.subnets.filter(s => s.value.includes(`/${subnetNetmask}`))

// }

// async function BuildNetwork(isCluster: boolean){
//     // Get the available subnets
//     const vpcSubnets = getSubnets(CIDR, SUBNET_NETMASK.toString())

//     // Get the Available Availability Zones
//     const azs = await aws.getAvailabilityZones({
//         state: "available"
//     })

//     // Create the VPC
//     let vpc_name = ``
//     const vpc = new aws.ec2.Vpc(vpc_name, {
//         cidrBlock: CIDR,
//         enableDnsHostnames: true
//     })

//     // Create the containers the Public / Private Subnets will reside
//     const publicSubnets: aws.ec2.Subnet[] = []
//     const privateSubnets: aws.ec2.Subnet[] = []

//     let subnetCounter = 0
//     // Loop Through the Availability Zones
//     azs.names.forEach((az: string) => {

//         // Create the Base Name for All the subnets
//         let subnetBaseName = `${BASE_NAME}/Subnet`
//         // Create a Unique Private Subnet Name
//         let privateName = `${subnetBaseName}Private${az.toUpperCase()}`
//         // Create a Unique Public Subnet Name
//         let publicName = `${subnetBaseName}Public${az.toUpperCase()}`
//         // Create the public Tags
//         let publicTags = createTags(publicName)
//         // Create the private Tags
//         let privateTags = createTags(privateName)

//         if(isCluster){
//             // Setup Base Tag
//             let tagA = `kubernetes.io/cluster/${BASE_NAME}`
//             // Add private cluster tags
//             privateTags[tagA as keyof typeof privateTags] = "shared"
//             privateTags["kubernetes.io/role/internal-elb" as keyof typeof privateTags] = "1"
//             // Add public cluster Tags
//             publicTags[tagA as keyof typeof publicTags] = "shared"
//             publicTags["kubernetes.io/role/elb" as keyof typeof publicTags] = "1"
//         }

//         // Create and Add the Private Subnet to container
//         privateSubnets.push(new aws.ec2.Subnet(privateName, {
//             vpcId: vpc.id,
//             cidrBlock: vpcSubnets[subnetCounter].value,
//             availabilityZone: az,
//             tags: privateTags
//         }))
//         subnetCounter ++

//         // Create and Add the Private Subnet to container
//         publicSubnets.push(new aws.ec2.Subnet(publicName, {
//             vpcId: vpc.id,
//             cidrBlock: vpcSubnets[subnetCounter].value,
//             availabilityZone: az,
//             tags: publicTags
//         }))
//         subnetCounter ++

//     })
//     // Create the Elastic IP for the Nat Gateway
//     let natGatewayIP_name = `${BASE_NAME}/nat/eip`
//     const natGatewayIP = new aws.ec2.Eip(natGatewayIP_name,{
//         vpc: true
//     })
//     // Create the NatGateway
//     let natGateway_name = `${BASE_NAME}/nat`
//     const natGateway = new aws.ec2.NatGateway(natGateway_name, {
//         subnetId: publicSubnets[0].id,
//         allocationId: natGatewayIP.allocationId
//     })
//     // Create the Internet Gateway
//     let clusterIGW_name = `${BASE_NAME}/igw`
//     const clusterIGW = new aws.ec2.InternetGateway(clusterIGW_name, {
//         vpcId: vpc.id,
//         tags: createTags(clusterIGW_name)
//     })
//     // Create Private Subnet Routing Tables & Associations
//     privateSubnets.forEach((subnet) => {

//         // Create Private Route Table
//         let rt_name = `${BASE_NAME}/RTPrivate`
//         let privateRT = new aws.ec2.RouteTable(rt_name, {
//             vpcId: vpc.id,
//             routes: [
//                 {
//                     cidrBlock: '0.0.0.0/0',
//                     natGatewayId: natGateway.id
//                 }
//             ],
//             tags: createTags(rt_name)
//         })
//         // Associate Route Table
//         let rta_name = `${rt_name}${subnet.availabilityZone}ACC`
//         new aws.ec2.RouteTableAssociation(rta_name, {
//             subnetId: subnet.id,
//             routeTableId: privateRT.id
//         })

//     })

//     // Create Public Route Table
//     let publicRT_name = `${BASE_NAME}/RTPublic`
//     const publicRT = new aws.ec2.RouteTable(publicRT_name, {
//         vpcId: vpc.id,
//         routes: [
//             {
//                 cidrBlock: '0.0.0.0/0',
//                 gatewayId: clusterIGW.id
//             }
//         ],
//         tags: createTags(publicRT_name)
//     })
//     // Associate Public Subnets with Public Routing Table
//     publicSubnets.forEach((subnet) => {
//         new aws.ec2.RouteTableAssociation(`${publicRT_name}${subnet.availabilityZone}ACC`, {
//             subnetId: subnet.id,
//             routeTableId: publicRT.id
//         })
//     })

// }


async function main(){

    const identity = await aws.getCallerIdentity({

    })

    // const clusterAdminRole = aws.iam.getRole({
    //     name: ``
    // })

    // BuildNetwork(true)


}

main()